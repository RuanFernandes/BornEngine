use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use rquickjs::{
    function::This, Context, Ctx, Function, Module, Object, Persistent, Runtime, Value,
};

const MAX_SOURCE_BYTES: usize = 1024 * 1024;
const MAX_COMMANDS_PER_CALLBACK: usize = 1024;
const MAX_LOG_BYTES: usize = 4096;
const MAX_PARTICLE_BURST: u32 = 4096;
const DEFAULT_MAX_MEMORY_BYTES: usize = 16 * 1024 * 1024;
const DEFAULT_MAX_STACK_BYTES: usize = 256 * 1024;
const DEFAULT_MAX_INTERRUPT_CHECKS: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScriptLimits {
    pub max_memory_bytes: usize,
    pub max_stack_bytes: usize,
    pub max_interrupt_checks: usize,
}

impl Default for ScriptLimits {
    fn default() -> Self {
        Self {
            max_memory_bytes: DEFAULT_MAX_MEMORY_BYTES,
            max_stack_bytes: DEFAULT_MAX_STACK_BYTES,
            max_interrupt_checks: DEFAULT_MAX_INTERRUPT_CHECKS,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScriptPermissions {
    pub log: bool,
    pub self_read: bool,
    pub self_transform_write: bool,
    pub self_particles_emit: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScriptContextData {
    pub self_id: String,
    pub self_position: [f64; 3],
}

impl ScriptContextData {
    pub fn new(self_id: impl Into<String>, self_position: [f64; 3]) -> Self {
        Self {
            self_id: self_id.into(),
            self_position,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ScriptCommand {
    Log(String),
    SetPosition([f64; 3]),
    MoveBy([f64; 3]),
    EmitBurst { count: u32, direction: [f64; 2] },
}

/// A capability-limited JavaScript module running in a private QuickJS heap.
///
/// Each VM has its own globals, memory limit and interruption budget. QuickJS
/// standard-library modules and module loaders are deliberately not enabled.
pub struct ScriptVm {
    // Persistent JS roots must be dropped before Context and Runtime.
    hooks: Option<Persistent<Object<'static>>>,
    context: Context,
    runtime: Runtime,
    limits: ScriptLimits,
    permissions: ScriptPermissions,
    commands: Rc<RefCell<Vec<ScriptCommand>>>,
    remaining_checks: Rc<Cell<usize>>,
    interrupted: Rc<Cell<bool>>,
    error: Option<String>,
    started: bool,
    disposed: bool,
}

impl ScriptVm {
    pub fn new(limits: ScriptLimits, permissions: ScriptPermissions) -> Result<Self, String> {
        if limits.max_memory_bytes < 64 * 1024 {
            return Err("script memory limit must be at least 65536 bytes".into());
        }
        if limits.max_stack_bytes < 16 * 1024 {
            return Err("script stack limit must be at least 16384 bytes".into());
        }
        if limits.max_interrupt_checks == 0 {
            return Err("script interrupt budget must be greater than zero".into());
        }

        let runtime =
            Runtime::new().map_err(|error| format!("could not create script runtime: {error}"))?;
        runtime.set_memory_limit(limits.max_memory_bytes);
        runtime.set_max_stack_size(limits.max_stack_bytes);

        let remaining_checks = Rc::new(Cell::new(limits.max_interrupt_checks));
        let interrupted = Rc::new(Cell::new(false));
        let check_counter = remaining_checks.clone();
        let interrupt_flag = interrupted.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || {
            let remaining = check_counter.get();
            if remaining == 0 {
                interrupt_flag.set(true);
                true
            } else {
                check_counter.set(remaining - 1);
                false
            }
        })));

        let context = Context::full(&runtime)
            .map_err(|error| format!("could not create script context: {error}"))?;
        Ok(Self {
            hooks: None,
            context,
            runtime,
            limits,
            permissions,
            commands: Rc::new(RefCell::new(Vec::new())),
            remaining_checks,
            interrupted,
            error: None,
            started: false,
            disposed: false,
        })
    }

    pub fn load(&mut self, source: &str) -> Result<(), String> {
        if self.disposed {
            return self.fail("script runtime has been disposed");
        }
        if self.hooks.is_some() {
            return self.fail("a script module is already loaded");
        }
        if source.len() > MAX_SOURCE_BYTES {
            return self.fail("script source exceeds the 1048576 byte limit");
        }

        self.reset_budget();
        let module_result = self.context.with(|ctx| -> rquickjs::Result<_> {
            let module = Module::declare(ctx.clone(), "bornengine-script.mjs", source)?;
            let (module, promise) = module.eval()?;
            promise.finish::<()>()?;
            let namespace = module.namespace()?;
            let default_export: Value = namespace.get("default")?;
            let hooks = default_export
                .as_object()
                .ok_or_else(|| rquickjs::Error::new_from_js("default export", "object"))?;
            for name in ["onStart", "update", "onDestroy"] {
                let value: Value = hooks.get(name)?;
                if !value.is_undefined() && value.as_function().is_none() {
                    return Err(rquickjs::Error::new_from_js(name, "function or undefined"));
                }
            }
            Ok(Persistent::save(&ctx, hooks.clone()))
        });

        match module_result {
            Ok(hooks) => {
                self.hooks = Some(hooks);
                self.error = None;
                Ok(())
            }
            Err(error) => {
                let message = self.execution_error(error.to_string());
                self.error = Some(message.clone());
                Err(message)
            }
        }
    }

    pub fn start(&mut self, data: ScriptContextData) {
        if self.disposed || self.started || self.hooks.is_none() {
            return;
        }
        self.started = true;
        self.invoke("onStart", data, None);
    }

    pub fn update(&mut self, data: ScriptContextData, delta_time: f64) {
        if self.disposed || !self.started || !delta_time.is_finite() {
            return;
        }
        self.invoke("update", data, Some(delta_time.clamp(0.0, 60.0)));
    }

    pub fn dispose(&mut self, data: ScriptContextData) {
        if self.disposed {
            return;
        }
        if self.started {
            self.invoke("onDestroy", data, None);
        }
        self.hooks = None;
        self.disposed = true;
    }

    pub fn drain_commands(&mut self) -> Vec<ScriptCommand> {
        std::mem::take(&mut *self.commands.borrow_mut())
    }

    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    pub fn memory_used(&self) -> usize {
        self.runtime.memory_usage().malloc_size.max(0) as usize
    }

    fn reset_budget(&self) {
        self.remaining_checks.set(self.limits.max_interrupt_checks);
        self.interrupted.set(false);
    }

    fn fail<T>(&mut self, message: &str) -> Result<T, String> {
        self.error = Some(message.to_owned());
        Err(message.to_owned())
    }

    fn execution_error(&self, message: String) -> String {
        if self.interrupted.get() {
            "script execution exceeded its instruction budget".into()
        } else if message.to_ascii_lowercase().contains("out of memory") {
            "script exceeded its memory limit".into()
        } else {
            message.chars().take(1024).collect()
        }
    }

    fn invoke(&mut self, hook: &str, data: ScriptContextData, delta_time: Option<f64>) {
        let Some(persistent_hooks) = self.hooks.as_ref().cloned() else {
            return;
        };
        self.reset_budget();
        let permissions = self.permissions;
        let commands = self.commands.clone();
        let result = self.context.with(|ctx| -> rquickjs::Result<()> {
            let hooks = persistent_hooks.restore(&ctx)?;
            let callback_value: Value = hooks.get(hook)?;
            let Some(callback) = callback_value.as_function() else {
                return Ok(());
            };
            let callback_context = Self::make_callback_context(&ctx, data, permissions, commands)?;
            match delta_time {
                Some(dt) => {
                    callback.call::<_, ()>((This(hooks), callback_context, dt))?;
                }
                None => {
                    callback.call::<_, ()>((This(hooks), callback_context))?;
                }
            }
            Ok(())
        });

        match result {
            Ok(()) => self.error = None,
            Err(error) => self.error = Some(self.execution_error(error.to_string())),
        }
    }

    fn make_callback_context<'js>(
        ctx: &Ctx<'js>,
        data: ScriptContextData,
        permissions: ScriptPermissions,
        commands: Rc<RefCell<Vec<ScriptCommand>>>,
    ) -> rquickjs::Result<Object<'js>> {
        let root = Object::new(ctx.clone())?;
        let self_object = Object::new(ctx.clone())?;

        if permissions.self_read {
            self_object.set("id", data.self_id)?;
            let position = Object::new(ctx.clone())?;
            position.set("x", data.self_position[0])?;
            position.set("y", data.self_position[1])?;
            position.set("z", data.self_position[2])?;
            self_object.set("position", position)?;
        }

        if permissions.self_transform_write {
            let set_commands = commands.clone();
            self_object.set(
                "setPosition",
                Function::new(ctx.clone(), move |x: f64, y: f64, z: f64| {
                    Self::push_command(&set_commands, ScriptCommand::SetPosition([x, y, z]));
                })?,
            )?;
            let move_commands = commands.clone();
            self_object.set(
                "moveBy",
                Function::new(ctx.clone(), move |x: f64, y: f64, z: f64| {
                    Self::push_command(&move_commands, ScriptCommand::MoveBy([x, y, z]));
                })?,
            )?;
        }

        if permissions.log {
            let log_commands = commands.clone();
            root.set(
                "log",
                Function::new(ctx.clone(), move |message: String| {
                    let message = message.chars().take(MAX_LOG_BYTES).collect();
                    Self::push_command(&log_commands, ScriptCommand::Log(message));
                })?,
            )?;
        }

        if permissions.self_particles_emit {
            let particles = Object::new(ctx.clone())?;
            let particle_commands = commands.clone();
            particles.set(
                "emitBurst",
                Function::new(
                    ctx.clone(),
                    move |count: i32, direction_x: Option<f64>, direction_y: Option<f64>| {
                        if count > 0 {
                            Self::push_command(
                                &particle_commands,
                                ScriptCommand::EmitBurst {
                                    count: (count as u32).min(MAX_PARTICLE_BURST),
                                    direction: [
                                        direction_x.filter(|v| v.is_finite()).unwrap_or(0.0),
                                        direction_y.filter(|v| v.is_finite()).unwrap_or(0.0),
                                    ],
                                },
                            );
                        }
                    },
                )?,
            )?;
            root.set("particles", particles)?;
        }

        root.set("self", self_object)?;
        Ok(root)
    }

    fn push_command(commands: &RefCell<Vec<ScriptCommand>>, command: ScriptCommand) {
        let mut commands = commands.borrow_mut();
        if commands.len() < MAX_COMMANDS_PER_CALLBACK {
            commands.push(command);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ScriptCommand, ScriptContextData, ScriptLimits, ScriptPermissions, ScriptVm};

    fn context() -> ScriptContextData {
        ScriptContextData::new("player-1", [2.0, 3.0, 0.0])
    }

    fn permissions() -> ScriptPermissions {
        ScriptPermissions {
            log: true,
            self_read: true,
            self_transform_write: true,
            self_particles_emit: true,
        }
    }

    #[test]
    fn script_vm_preserves_guest_state_between_updates() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        vm.load("export default { count: 0, update(ctx) { this.count += 1; ctx.log(String(this.count)); } }")
            .unwrap();

        vm.start(context());
        vm.update(context(), 1.0);
        vm.update(context(), 1.0);

        assert_eq!(
            vm.drain_commands(),
            vec![
                ScriptCommand::Log("1".into()),
                ScriptCommand::Log("2".into())
            ]
        );
        assert!(vm.error().is_none());
    }

    #[test]
    fn script_vm_rejects_invalid_module_safely() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();

        assert!(vm.load("export default { update( {").is_err());
        assert!(vm.error().is_some());
    }

    #[test]
    fn script_vm_hides_denied_host_functions() {
        let mut vm = ScriptVm::new(
            ScriptLimits::default(),
            ScriptPermissions {
                log: true,
                ..ScriptPermissions::default()
            },
        )
        .unwrap();
        vm.load("export default { onStart(ctx) { ctx.log(typeof ctx.setPosition); } }")
            .unwrap();

        vm.start(context());

        assert_eq!(
            vm.drain_commands(),
            vec![ScriptCommand::Log("undefined".into())]
        );
    }

    #[test]
    fn script_vm_buffers_only_granted_commands_in_order() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        vm.load("export default { onStart(ctx) { ctx.self.moveBy(1, -2, 0); ctx.self.setPosition(9, 8, 7); ctx.particles.emitBurst(5, 0.5, -0.25); } }")
            .unwrap();

        vm.start(context());

        assert_eq!(
            vm.drain_commands(),
            vec![
                ScriptCommand::MoveBy([1.0, -2.0, 0.0]),
                ScriptCommand::SetPosition([9.0, 8.0, 7.0]),
                ScriptCommand::EmitBurst {
                    count: 5,
                    direction: [0.5, -0.25]
                },
            ]
        );
    }

    #[test]
    fn script_vm_isolates_runtime_globals() {
        let source = "globalThis.counter = 0; export default { update(ctx) { globalThis.counter += 1; ctx.log(String(globalThis.counter)); } }";
        let mut first = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        let mut second = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        first.load(source).unwrap();
        second.load(source).unwrap();

        first.start(context());
        second.start(context());
        first.update(context(), 0.1);
        first.update(context(), 0.1);
        second.update(context(), 0.1);

        assert_eq!(
            first.drain_commands(),
            vec![
                ScriptCommand::Log("1".into()),
                ScriptCommand::Log("2".into())
            ]
        );
        assert_eq!(
            second.drain_commands(),
            vec![ScriptCommand::Log("1".into())]
        );
    }

    #[test]
    fn script_vm_stops_after_interrupt_budget() {
        let limits = ScriptLimits {
            max_interrupt_checks: 8,
            ..ScriptLimits::default()
        };
        let mut vm = ScriptVm::new(limits, permissions()).unwrap();
        vm.load("export default { update() { while (true) {} } }")
            .unwrap();
        vm.start(context());

        vm.update(context(), 0.1);

        assert!(vm.error().is_some());
    }

    #[test]
    fn script_vm_enforces_heap_limit() {
        let limits = ScriptLimits {
            max_memory_bytes: 256 * 1024,
            ..ScriptLimits::default()
        };
        let mut vm = ScriptVm::new(limits, permissions()).unwrap();
        vm.load("export default { update() { globalThis.data = new Array(1000000).fill('bornengine'); } }")
            .unwrap();
        vm.start(context());

        vm.update(context(), 0.1);

        assert!(vm.error().is_some());
        assert!(vm.memory_used() <= limits.max_memory_bytes);
    }

    #[test]
    fn script_vm_rejects_non_function_lifecycle_hooks() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();

        assert!(vm.load("export default { update: 42 }").is_err());
        assert!(vm.error().unwrap().contains("update"));
    }
}
