use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use rquickjs::{
    function::This, CaughtError, Context, Ctx, Function, Module, Object, Persistent, Runtime, Value,
};

const MAX_SOURCE_BYTES: usize = 1024 * 1024;
const MAX_COMMANDS_PER_CALLBACK: usize = 1024;
const MAX_LOG_BYTES: usize = 4096;
const MAX_ERROR_BYTES: usize = 1024;
const MAX_PARTICLE_BURST: u32 = 4096;
const DEFAULT_MAX_MEMORY_BYTES: usize = 16 * 1024 * 1024;
const DEFAULT_MAX_STACK_BYTES: usize = 256 * 1024;
const DEFAULT_MAX_INTERRUPT_CHECKS: usize = 10_000;
const MAX_MEMORY_BYTES: usize = 64 * 1024 * 1024;
const MAX_STACK_BYTES: usize = 8 * 1024 * 1024;
const MAX_INTERRUPT_CHECKS: usize = 1_000_000;
const SCRIPT_HANDLE_SLOT_BITS: u32 = 16;
const SCRIPT_HANDLE_SLOT_MASK: u32 = (1 << SCRIPT_HANDLE_SLOT_BITS) - 1;
const SCRIPT_HANDLE_MAX_SLOTS: usize = SCRIPT_HANDLE_SLOT_MASK as usize;

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
            self_position: finite_position(self_position).unwrap_or([0.0; 3]),
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

struct ScriptVmSlot {
    generation: u16,
    vm: Option<ScriptVm>,
}

thread_local! {
    static SCRIPT_VMS: RefCell<Vec<ScriptVmSlot>> = const { RefCell::new(Vec::new()) };
}

/// Create a script VM in the calling thread's handle table.
/// Perry drives BornEngine callbacks on one game thread; all operations for a
/// handle must remain on the thread which created it.
pub fn create_script_vm(
    limits: ScriptLimits,
    permissions: ScriptPermissions,
) -> Result<u32, String> {
    let vm = ScriptVm::new(limits, permissions)?;
    SCRIPT_VMS.with(|registry| {
        let mut slots = registry.borrow_mut();
        let index = if let Some(index) = slots.iter().position(|slot| slot.vm.is_none()) {
            index
        } else {
            if slots.len() >= SCRIPT_HANDLE_MAX_SLOTS {
                return Err("script runtime handle table is full".into());
            }
            slots.push(ScriptVmSlot {
                generation: 1,
                vm: None,
            });
            slots.len() - 1
        };
        let slot = &mut slots[index];
        if slot.generation == 0 {
            slot.generation = 1;
        }
        slot.vm = Some(vm);
        let low = (index as u32) + 1;
        Ok(((slot.generation as u32) << SCRIPT_HANDLE_SLOT_BITS) | low)
    })
}

/// Access a script VM only when its slot and generation still match.
pub fn with_script_vm<R>(handle: u32, f: impl FnOnce(&mut ScriptVm) -> R) -> Option<R> {
    let (index, generation) = decode_script_handle(handle)?;
    SCRIPT_VMS.with(|registry| {
        let mut slots = registry.borrow_mut();
        let slot = slots.get_mut(index)?;
        if slot.generation != generation {
            return None;
        }
        slot.vm.as_mut().map(f)
    })
}

pub fn script_start(handle: u32, data: ScriptContextData) -> Option<i32> {
    with_script_vm(handle, |vm| {
        vm.start(data);
        vm.status_code()
    })
}

pub fn script_update(handle: u32, data: ScriptContextData, delta_time: f64) -> Option<i32> {
    with_script_vm(handle, |vm| {
        vm.update(data, delta_time);
        vm.status_code()
    })
}

pub fn script_dispose(handle: u32, data: ScriptContextData) -> Option<i32> {
    with_script_vm(handle, |vm| {
        vm.dispose(data);
        vm.status_code()
    })
}

pub fn script_destroy(handle: u32) -> bool {
    let Some((index, generation)) = decode_script_handle(handle) else {
        return false;
    };
    SCRIPT_VMS.with(|registry| {
        let mut slots = registry.borrow_mut();
        let Some(slot) = slots.get_mut(index) else {
            return false;
        };
        if slot.generation != generation || slot.vm.is_none() {
            return false;
        }
        slot.vm = None;
        slot.generation = slot.generation.wrapping_add(1).max(1);
        true
    })
}

pub fn script_command_count(handle: u32) -> Option<usize> {
    with_script_vm(handle, |vm| vm.command_count())
}

pub fn script_command_kind(handle: u32, index: usize) -> Option<u32> {
    with_script_vm(handle, |vm| vm.command_kind(index))?
}

pub fn script_command_number(handle: u32, index: usize, slot: usize) -> Option<f64> {
    with_script_vm(handle, |vm| vm.command_number(index, slot))?
}

pub fn script_command_text(handle: u32, index: usize) -> Option<String> {
    with_script_vm(handle, |vm| vm.command_text(index))?
}

pub fn clear_script_commands(handle: u32) -> bool {
    with_script_vm(handle, |vm| vm.clear_commands()).is_some()
}

pub fn script_status(handle: u32) -> Option<i32> {
    with_script_vm(handle, |vm| vm.status_code())
}

pub fn script_error(handle: u32) -> Option<String> {
    with_script_vm(handle, |vm| vm.error().map(str::to_owned))?
}

pub fn script_memory_used(handle: u32) -> Option<usize> {
    with_script_vm(handle, |vm| vm.memory_used())
}

fn decode_script_handle(handle: u32) -> Option<(usize, u16)> {
    let low = handle & SCRIPT_HANDLE_SLOT_MASK;
    let generation = (handle >> SCRIPT_HANDLE_SLOT_BITS) as u16;
    if low == 0 || generation == 0 {
        return None;
    }
    Some(((low - 1) as usize, generation))
}

impl ScriptVm {
    pub fn new(limits: ScriptLimits, permissions: ScriptPermissions) -> Result<Self, String> {
        if limits.max_memory_bytes < 64 * 1024 {
            return Err("script memory limit must be at least 65536 bytes".into());
        }
        if limits.max_memory_bytes > MAX_MEMORY_BYTES {
            return Err("script memory limit must not exceed 67108864 bytes".into());
        }
        if limits.max_stack_bytes < 16 * 1024 {
            return Err("script stack limit must be at least 16384 bytes".into());
        }
        if limits.max_stack_bytes > MAX_STACK_BYTES {
            return Err("script stack limit must not exceed 8388608 bytes".into());
        }
        if limits.max_interrupt_checks == 0 {
            return Err("script interrupt budget must be greater than zero".into());
        }
        if limits.max_interrupt_checks > MAX_INTERRUPT_CHECKS {
            return Err("script interrupt budget must not exceed 1000000 checks".into());
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
        let module_result = self.context.with(|ctx| {
            let result = (|| -> rquickjs::Result<_> {
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
            })();
            result.map_err(|error| Self::guest_error(&ctx, error))
        });

        match module_result {
            Ok(hooks) => {
                self.hooks = Some(hooks);
                self.error = None;
                Ok(())
            }
            Err(error) => {
                let message = self.execution_error(error);
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
        if self.disposed || !self.started || self.error.is_some() || !delta_time.is_finite() {
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

    pub fn status_code(&self) -> i32 {
        if self.error.is_some() {
            2
        } else if self.hooks.is_some() && !self.disposed {
            1
        } else {
            0
        }
    }

    pub fn command_count(&self) -> usize {
        self.commands.borrow().len()
    }

    pub fn command_kind(&self, index: usize) -> Option<u32> {
        self.commands
            .borrow()
            .get(index)
            .map(|command| match command {
                ScriptCommand::Log(_) => 1,
                ScriptCommand::SetPosition(_) => 2,
                ScriptCommand::MoveBy(_) => 3,
                ScriptCommand::EmitBurst { .. } => 4,
            })
    }

    pub fn command_number(&self, index: usize, slot: usize) -> Option<f64> {
        self.commands
            .borrow()
            .get(index)
            .and_then(|command| match command {
                ScriptCommand::Log(_) => None,
                ScriptCommand::SetPosition(position) | ScriptCommand::MoveBy(position) => {
                    position.get(slot).copied()
                }
                ScriptCommand::EmitBurst { count, direction } => match slot {
                    0 => Some(*count as f64),
                    1..=2 => direction.get(slot - 1).copied(),
                    _ => None,
                },
            })
    }

    pub fn command_text(&self, index: usize) -> Option<String> {
        self.commands
            .borrow()
            .get(index)
            .and_then(|command| match command {
                ScriptCommand::Log(message) => Some(message.clone()),
                _ => None,
            })
    }

    pub fn clear_commands(&mut self) {
        self.commands.borrow_mut().clear();
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
            bounded_prefix(&message, MAX_ERROR_BYTES).to_owned()
        }
    }

    fn guest_error(ctx: &Ctx<'_>, error: rquickjs::Error) -> String {
        match CaughtError::from_error(ctx, error) {
            CaughtError::Exception(exception) => {
                let message = exception
                    .message()
                    .unwrap_or_else(|| "JavaScript exception".into());
                let message = bounded_prefix(&message, MAX_ERROR_BYTES);
                match exception.stack() {
                    Some(stack) if !stack.is_empty() && message.len() + 1 < MAX_ERROR_BYTES => {
                        let remaining = MAX_ERROR_BYTES - message.len() - 1;
                        format!("{message}\n{}", bounded_prefix(&stack, remaining))
                    }
                    _ => message.to_owned(),
                }
            }
            CaughtError::Value(value) => value
                .as_string()
                .and_then(|text| text.to_string().ok())
                .unwrap_or_else(|| format!("JavaScript threw {value:?}")),
            CaughtError::Error(error) => error.to_string(),
        }
    }

    fn invoke(&mut self, hook: &str, data: ScriptContextData, delta_time: Option<f64>) {
        let Some(persistent_hooks) = self.hooks.as_ref().cloned() else {
            return;
        };
        self.reset_budget();
        let command_baseline = self.commands.borrow().len();
        let permissions = self.permissions;
        let commands = self.commands.clone();
        let result = self.context.with(|ctx| {
            let call_result = (|| -> rquickjs::Result<Option<Value>> {
                let hooks = persistent_hooks.restore(&ctx)?;
                let callback_value: Value = hooks.get(hook)?;
                let Some(callback) = callback_value.as_function() else {
                    return Ok(None);
                };
                let callback_context =
                    Self::make_callback_context(&ctx, data, permissions, commands)?;
                let value = match delta_time {
                    Some(dt) => callback.call::<_, Value>((This(hooks), callback_context, dt))?,
                    None => callback.call::<_, Value>((This(hooks), callback_context))?,
                };
                Ok(Some(value))
            })();
            match call_result {
                Ok(Some(value)) if value.is_promise() => Err(format!(
                    "script hook `{hook}` returned a Promise; v1 hooks must be synchronous"
                )),
                Ok(_) => Ok(()),
                Err(error) => Err(Self::guest_error(&ctx, error)),
            }
        });

        match result {
            Ok(()) => self.error = None,
            Err(error) => {
                self.commands.borrow_mut().truncate(command_baseline);
                self.error = Some(self.execution_error(error));
            }
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
                    if let Some(position) = finite_position([x, y, z]) {
                        Self::push_command(&set_commands, ScriptCommand::SetPosition(position));
                    }
                })?,
            )?;
            let move_commands = commands.clone();
            self_object.set(
                "moveBy",
                Function::new(ctx.clone(), move |x: f64, y: f64, z: f64| {
                    if let Some(delta) = finite_position([x, y, z]) {
                        Self::push_command(&move_commands, ScriptCommand::MoveBy(delta));
                    }
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
                                        direction_x
                                            .filter(|v| v.is_finite())
                                            .unwrap_or(0.0)
                                            .clamp(-1_000_000.0, 1_000_000.0),
                                        direction_y
                                            .filter(|v| v.is_finite())
                                            .unwrap_or(0.0)
                                            .clamp(-1_000_000.0, 1_000_000.0),
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

fn finite_position(position: [f64; 3]) -> Option<[f64; 3]> {
    position
        .iter()
        .all(|value| value.is_finite() && value.abs() <= 1_000_000_000.0)
        .then_some(position)
}

fn bounded_prefix(text: &str, max_bytes: usize) -> &str {
    let mut end = text.len().min(max_bytes);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

#[cfg(test)]
mod tests {
    use super::{
        clear_script_commands, create_script_vm, script_command_count, script_command_kind,
        script_command_number, script_command_text, script_destroy, script_update, with_script_vm,
        ScriptCommand, ScriptContextData, ScriptLimits, ScriptPermissions, ScriptVm,
    };

    fn context() -> ScriptContextData {
        ScriptContextData::new("player-1", [2.0, 3.0, 0.0])
    }

    #[test]
    fn script_context_sanitizes_non_finite_positions() {
        let context = ScriptContextData::new("player-1", [f64::NAN, f64::INFINITY, 0.0]);
        assert_eq!(context.self_position, [0.0; 3]);
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
        let error = vm.error().unwrap();
        assert!(error.contains("invalid property name"), "{error}");
        assert!(error.contains("bornengine-script.mjs"), "{error}");
        assert!(!error.eq_ignore_ascii_case("Exception"), "{error}");
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
        vm.load("export default { onStart(ctx) { ctx.log(typeof ctx.self.setPosition); ctx.log(typeof ctx.self.moveBy); ctx.log(typeof ctx.self.id); ctx.log(typeof ctx.particles); ctx.log(typeof globalThis.std); } }")
            .unwrap();

        vm.start(context());

        assert_eq!(
            vm.drain_commands(),
            vec![ScriptCommand::Log("undefined".into()); 5]
        );
        let mut imported = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        assert!(imported
            .load("import x from './private.js'; export default x;")
            .is_err());
        assert!(imported.error().is_some());
    }

    #[test]
    fn script_vm_rejects_promise_hook_and_discards_queued_commands() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        vm.load("export default { async update(ctx) { ctx.self.setPosition(9, 8, 7); await Promise.resolve(); ctx.log('late'); } }").unwrap();
        vm.start(context());

        vm.update(context(), 0.016);

        assert_eq!(vm.status_code(), 2);
        assert!(
            vm.error().unwrap().contains("synchronous"),
            "{:?}",
            vm.error()
        );
        assert!(vm.drain_commands().is_empty());
        vm.update(context(), 0.016);
        assert!(vm.drain_commands().is_empty());
    }

    #[test]
    fn script_vm_rejects_async_rejection_without_leaking_commands() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        vm.load("export default { async update(ctx) { ctx.log('before'); await Promise.resolve(); ctx.log('after'); throw new Error('rejected'); } }").unwrap();
        vm.start(context());

        vm.update(context(), 0.016);

        assert_eq!(vm.status_code(), 2);
        assert!(
            vm.error().unwrap().contains("synchronous"),
            "{:?}",
            vm.error()
        );
        assert!(vm.drain_commands().is_empty());
    }

    #[test]
    fn script_vm_preserves_guest_exception_message_and_stack() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        vm.load("export default { update(ctx) { ctx.log('discard'); throw new Error('guest failure detail'); } }").unwrap();
        vm.start(context());

        vm.update(context(), 0.016);

        let error = vm.error().unwrap();
        assert!(error.contains("guest failure detail"), "{error}");
        assert!(error.contains("update"), "{error}");
        assert!(error.len() <= 1024);
        assert!(vm.drain_commands().is_empty());
    }

    #[test]
    fn script_vm_bounds_unicode_guest_errors_by_bytes() {
        let mut vm = ScriptVm::new(ScriptLimits::default(), permissions()).unwrap();
        vm.load("export default { update() { throw new Error('🦀'.repeat(2000)); } }")
            .unwrap();
        vm.start(context());

        vm.update(context(), 0.016);

        assert!(
            vm.error().unwrap().len() <= 1024,
            "guest error exceeded byte limit"
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

    #[test]
    fn script_handles_isolate_commands_and_reject_destroyed_handles() {
        let permissions = ScriptPermissions {
            log: true,
            ..ScriptPermissions::default()
        };
        let first = create_script_vm(ScriptLimits::default(), permissions).unwrap();
        let second = create_script_vm(ScriptLimits::default(), permissions).unwrap();
        for (handle, label) in [(first, "first"), (second, "second")] {
            with_script_vm(handle, |vm| {
                vm.load(&format!(
                    "export default {{ onStart(ctx) {{ ctx.log('{label}'); }} }}"
                ))
                .unwrap();
                vm.start(context());
            })
            .unwrap();
        }

        assert_eq!(script_command_count(first), Some(1));
        assert_eq!(script_command_count(second), Some(1));
        assert_eq!(script_command_text(first, 0).as_deref(), Some("first"));
        assert_eq!(script_command_text(second, 0).as_deref(), Some("second"));
        assert!(script_destroy(first));
        assert!(with_script_vm(first, |_| ()).is_none());
        assert!(!script_destroy(first));
        script_destroy(second);
    }

    #[test]
    fn script_ffi_command_view_uses_stable_scalar_slots() {
        let handle = create_script_vm(ScriptLimits::default(), permissions()).unwrap();
        with_script_vm(handle, |vm| {
            vm.load("export default { onStart(ctx) { ctx.self.setPosition(4, 5, 6); ctx.particles.emitBurst(7, 0.25, -0.5); } }")
                .unwrap();
            vm.start(context());
        })
        .unwrap();

        assert_eq!(script_command_kind(handle, 0), Some(2));
        assert_eq!(script_command_number(handle, 0, 2), Some(6.0));
        assert_eq!(script_command_kind(handle, 1), Some(4));
        assert_eq!(script_command_number(handle, 1, 0), Some(7.0));
        assert_eq!(script_command_number(handle, 1, 2), Some(-0.5));
        assert_eq!(script_command_count(handle), Some(2));
        clear_script_commands(handle);
        assert_eq!(script_command_count(handle), Some(0));
        script_destroy(handle);
    }

    #[test]
    fn script_status_and_update_keep_guest_errors_local() {
        let permissions = ScriptPermissions::default();
        let handle = create_script_vm(ScriptLimits::default(), permissions).unwrap();
        with_script_vm(handle, |vm| {
            vm.load("export default { update() { throw new Error('guest failure'); } }")
                .unwrap();
            vm.start(context());
        })
        .unwrap();
        assert_eq!(
            script_update(handle, context(), 0.016),
            Some(2),
            "an exception should be exposed as script status, not cross the host boundary"
        );
        script_destroy(handle);
    }
}
