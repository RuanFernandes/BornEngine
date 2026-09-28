//! Native CPU pool for batched 2D sprite particles.

use std::collections::HashMap;

const CONFIG_HEADER: usize = 31;
const MAX_FRAMES: usize = 1024;
const MAX_CAPACITY: usize = 100_000;

#[derive(Clone, Copy, Debug)]
pub struct Particle2DTransform {
    pub position: [f32; 2],
    /// Rotation in radians.
    pub rotation: f32,
    pub scale: [f32; 2],
}

impl Particle2DTransform {
    fn normalized(self) -> Self {
        Self {
            position: [
                finite_or(self.position[0], 0.0),
                finite_or(self.position[1], 0.0),
            ],
            rotation: finite_or(self.rotation, 0.0),
            scale: [finite_or(self.scale[0], 1.0), finite_or(self.scale[1], 1.0)],
        }
    }

    fn transform_vector(self, value: [f32; 2]) -> [f32; 2] {
        let transform = self.normalized();
        let x = value[0] * transform.scale[0];
        let y = value[1] * transform.scale[1];
        let cos = transform.rotation.cos();
        let sin = transform.rotation.sin();
        [x * cos - y * sin, x * sin + y * cos]
    }

    fn transform_point(self, value: [f32; 2]) -> [f32; 2] {
        let transform = self.normalized();
        let vector = transform.transform_vector(value);
        [
            transform.position[0] + vector[0],
            transform.position[1] + vector[1],
        ]
    }
}

impl Default for Particle2DTransform {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0],
            rotation: 0.0,
            scale: [1.0, 1.0],
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Particle2DFrame {
    source: [f32; 4],
}

#[derive(Clone, Copy, Debug)]
struct Particle2DShape {
    kind: u32,
    width_or_radius: f32,
    height: f32,
    cone_half_angle: f32,
}

#[derive(Clone, Copy, Debug)]
struct Particle2D {
    position: [f32; 2],
    velocity: [f32; 2],
    age: f32,
    lifetime: f32,
    start_size: f32,
    end_size: f32,
    start_color: [f32; 4],
    end_color: [f32; 4],
    rotation_degrees: f32,
    spin_degrees_per_second: f32,
    first_frame: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Particle2DDraw {
    pub source: [f32; 4],
    /// Particle center in scene/world coordinates.
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation_degrees: f32,
    /// RGBA channels in the engine's 0..255 color range.
    pub color: [f32; 4],
}

/// One sprite emitter's CPU-side pool and immutable atlas/config data.
pub struct ParticleEmitter2D {
    pub capacity: usize,
    pub texture_handle: f64,
    texture_size: [u32; 2],
    slots: Vec<Option<Particle2D>>,
    active: Vec<usize>,
    free: Vec<usize>,
    frames: Vec<Particle2DFrame>,
    emission_rate: f32,
    emission_remainder: f32,
    shape: Particle2DShape,
    lifetime: [f32; 2],
    speed: [f32; 2],
    start_size: [f32; 2],
    end_size: [f32; 2],
    acceleration: [f32; 2],
    drag: f32,
    start_color: [f32; 4],
    end_color: [f32; 4],
    spin: [f32; 2],
    direction: [f32; 2],
    local_space: bool,
    frame_rate: f32,
    playing: bool,
    rng: u32,
}

impl ParticleEmitter2D {
    pub fn new(
        capacity: usize,
        texture_handle: f64,
        texture_width: u32,
        texture_height: u32,
    ) -> Self {
        let capacity = capacity.clamp(1, MAX_CAPACITY);
        let mut free = Vec::with_capacity(capacity);
        for index in (0..capacity).rev() {
            free.push(index);
        }
        Self {
            capacity,
            texture_handle,
            texture_size: [texture_width, texture_height],
            slots: vec![None; capacity],
            active: Vec::with_capacity(capacity),
            free,
            frames: vec![Particle2DFrame {
                source: [0.0, 0.0, texture_width as f32, texture_height as f32],
            }],
            emission_rate: 0.0,
            emission_remainder: 0.0,
            shape: Particle2DShape {
                kind: 0,
                width_or_radius: 0.0,
                height: 0.0,
                cone_half_angle: 0.0,
            },
            lifetime: [1.0, 1.0],
            speed: [0.0, 0.0],
            start_size: [8.0, 8.0],
            end_size: [8.0, 8.0],
            acceleration: [0.0, 0.0],
            drag: 0.0,
            start_color: [255.0; 4],
            end_color: [255.0, 255.0, 255.0, 0.0],
            spin: [0.0, 0.0],
            direction: [0.0, -1.0],
            local_space: true,
            frame_rate: 0.0,
            playing: false,
            rng: 0xA341_316C,
        }
    }

    /// Applies the version-1 flat FFI payload. Invalid payloads leave the old
    /// configuration intact and return false.
    pub fn configure_from_slice(&mut self, values: &[f32]) -> bool {
        if values.len() < CONFIG_HEADER || values.iter().any(|value| !value.is_finite()) {
            return false;
        }
        let frame_count = values[30] as usize;
        if frame_count == 0
            || frame_count > MAX_FRAMES
            || values[30] != frame_count as f32
            || values.len() != CONFIG_HEADER + frame_count * 4
        {
            return false;
        }
        let shape_kind = values[1] as u32;
        if values[1] != shape_kind as f32
            || shape_kind > 3
            || values[0] < 0.0
            || values[2] < 0.0
            || values[3] < 0.0
            || values[4] < 0.0
            || values[4] > 360.0
            || values[5] <= 0.0
            || values[6] < values[5]
            || values[7] < 0.0
            || values[8] < values[7]
            || values[9] < 0.0
            || values[10] < values[9]
            || values[11] < 0.0
            || values[12] < values[11]
            || values[15] < 0.0
            || values[24] > values[25]
            || values[28] != 0.0 && values[28] != 1.0
            || values[29] < 0.0
        {
            return false;
        }
        for color_index in 16..24 {
            if !(0.0..=255.0).contains(&values[color_index]) {
                return false;
            }
        }
        let mut frames = Vec::with_capacity(frame_count);
        for frame_index in 0..frame_count {
            let offset = CONFIG_HEADER + frame_index * 4;
            let source = [
                values[offset],
                values[offset + 1],
                values[offset + 2],
                values[offset + 3],
            ];
            if source[0] < 0.0
                || source[1] < 0.0
                || source[2] <= 0.0
                || source[3] <= 0.0
                || source[0] + source[2] > self.texture_size[0] as f32
                || source[1] + source[3] > self.texture_size[1] as f32
            {
                return false;
            }
            frames.push(Particle2DFrame { source });
        }

        self.emission_rate = values[0];
        self.shape = Particle2DShape {
            kind: shape_kind,
            width_or_radius: values[2],
            height: values[3],
            cone_half_angle: values[4].to_radians() * 0.5,
        };
        self.lifetime = [values[5], values[6]];
        self.speed = [values[7], values[8]];
        self.start_size = [values[9], values[10]];
        self.end_size = [values[11], values[12]];
        self.acceleration = [values[13], values[14]];
        self.drag = values[15];
        self.start_color.copy_from_slice(&values[16..20]);
        self.end_color.copy_from_slice(&values[20..24]);
        self.spin = [values[24], values[25]];
        self.direction = normalize([values[26], values[27]], [0.0, -1.0]);
        self.local_space = values[28] == 0.0;
        self.frame_rate = values[29];
        self.frames = frames;
        true
    }

    pub fn emit(
        &mut self,
        count: usize,
        position: [f32; 2],
        direction: [f32; 2],
        transform: Particle2DTransform,
    ) {
        let transform = transform.normalized();
        let direction = normalize(direction, self.direction);
        for _ in 0..count.min(self.capacity) {
            if !self.spawn_particle(position, direction, transform, 0.0) {
                break;
            }
        }
    }

    pub fn update(&mut self, delta_time: f32, transform: Particle2DTransform) -> usize {
        if !delta_time.is_finite() || delta_time <= 0.0 {
            return self.active.len();
        }
        let dt = delta_time;
        let mut cursor = 0;
        while cursor < self.active.len() {
            let index = self.active[cursor];
            let particle = self.slots[index]
                .as_mut()
                .expect("active particle slot is populated");
            if !advance_particle(particle, dt, self.acceleration, self.drag) {
                self.slots[index] = None;
                self.active.swap_remove(cursor);
                self.free.push(index);
                continue;
            }
            cursor += 1;
        }

        if self.playing && self.emission_rate > 0.0 {
            // Keep the fractional emission phase and assign each new particle
            // only the portion of this step after its scheduled birth time.
            let remainder_before = self.emission_remainder as f64;
            let total = remainder_before + self.emission_rate as f64 * dt as f64;
            let whole_births = total.floor();
            self.emission_remainder = total.fract() as f32;
            let spawn_count = whole_births.min(self.free.len() as f64) as usize;
            let first_birth = whole_births - spawn_count as f64;
            for offset in 0..spawn_count {
                let birth_index = first_birth + offset as f64;
                let birth_time = ((1.0 - remainder_before + birth_index)
                    / self.emission_rate as f64)
                    .clamp(0.0, dt as f64) as f32;
                self.spawn_particle(
                    [0.0, 0.0],
                    self.direction,
                    transform,
                    (dt - birth_time).max(0.0),
                );
            }
        }
        self.active.len()
    }

    pub fn play(&mut self) {
        self.playing = true;
    }
    pub fn stop(&mut self) {
        self.playing = false;
    }

    pub fn clear(&mut self) {
        for index in self.active.drain(..) {
            self.slots[index] = None;
            self.free.push(index);
        }
        self.emission_remainder = 0.0;
        self.playing = false;
    }

    pub fn live_count(&self) -> usize {
        self.active.len()
    }

    pub fn for_each_draw(
        &self,
        transform: Particle2DTransform,
        mut callback: impl FnMut(Particle2DDraw),
    ) {
        let transform = transform.normalized();
        for &index in &self.active {
            let particle = match self.slots[index].as_ref() {
                Some(particle) => particle,
                None => continue,
            };
            let normalized_age = (particle.age / particle.lifetime).clamp(0.0, 1.0);
            let size = lerp(particle.start_size, particle.end_size, normalized_age);
            if size <= 0.0 {
                continue;
            }
            let frame_index = (particle.first_frame
                + (particle.age * self.frame_rate).floor() as usize)
                % self.frames.len();
            let frame = self.frames[frame_index];
            let world_position = if self.local_space {
                transform.transform_point(particle.position)
            } else {
                particle.position
            };
            let scale_x = if self.local_space {
                transform.scale[0].abs()
            } else {
                1.0
            };
            let scale_y = if self.local_space {
                transform.scale[1].abs()
            } else {
                1.0
            };
            let width = size * scale_x;
            let height = size * frame.source[3] / frame.source[2] * scale_y;
            let color = std::array::from_fn(|channel| {
                lerp(
                    particle.start_color[channel],
                    particle.end_color[channel],
                    normalized_age,
                )
            });
            let rotation = particle.rotation_degrees
                + if self.local_space {
                    transform.rotation.to_degrees()
                } else {
                    0.0
                };
            callback(Particle2DDraw {
                source: frame.source,
                x: world_position[0],
                y: world_position[1],
                width,
                height,
                rotation_degrees: rotation,
                color,
            });
        }
    }

    fn random_spawn_offset(&mut self) -> [f32; 2] {
        match self.shape.kind {
            1 => {
                let radius = self.shape.width_or_radius * self.random().sqrt();
                let angle = self.random() * std::f32::consts::TAU;
                [angle.cos() * radius, angle.sin() * radius]
            }
            2 => [
                (self.random() - 0.5) * self.shape.width_or_radius,
                (self.random() - 0.5) * self.shape.height,
            ],
            _ => [0.0, 0.0],
        }
    }

    fn random_velocity(&mut self, direction: [f32; 2]) -> [f32; 2] {
        let angle = if self.shape.kind == 3 {
            (self.random() * 2.0 - 1.0) * self.shape.cone_half_angle
        } else {
            0.0
        };
        let cos = angle.cos();
        let sin = angle.sin();
        let direction = [
            direction[0] * cos - direction[1] * sin,
            direction[0] * sin + direction[1] * cos,
        ];
        let speed = self.random_range(self.speed);
        [direction[0] * speed, direction[1] * speed]
    }

    fn random_range(&mut self, range: [f32; 2]) -> f32 {
        range[0] + (range[1] - range[0]) * self.random()
    }

    fn random_index(&mut self, len: usize) -> usize {
        if len <= 1 {
            0
        } else {
            ((self.random() * len as f32) as usize).min(len - 1)
        }
    }

    fn random(&mut self) -> f32 {
        let mut value = self.rng;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.rng = value.max(1);
        (value as f64 / u32::MAX as f64) as f32
    }

    fn spawn_particle(
        &mut self,
        position: [f32; 2],
        direction: [f32; 2],
        transform: Particle2DTransform,
        age: f32,
    ) -> bool {
        let slot_index = match self.free.pop() {
            Some(index) => index,
            None => return false,
        };
        let offset = self.random_spawn_offset();
        let mut velocity = self.random_velocity(direction);
        let spawn_position = [position[0] + offset[0], position[1] + offset[1]];
        let spawn_position = if self.local_space {
            spawn_position
        } else {
            transform.transform_point(spawn_position)
        };
        if !self.local_space {
            velocity = transform.transform_vector(velocity);
        }
        let mut particle = Particle2D {
            position: spawn_position,
            velocity,
            age: 0.0,
            lifetime: self.random_range(self.lifetime),
            start_size: self.random_range(self.start_size),
            end_size: self.random_range(self.end_size),
            start_color: self.start_color,
            end_color: self.end_color,
            rotation_degrees: 0.0,
            spin_degrees_per_second: self.random_range(self.spin),
            first_frame: self.random_index(self.frames.len()),
        };
        if age > 0.0 && !advance_particle(&mut particle, age, self.acceleration, self.drag) {
            self.free.push(slot_index);
            return false;
        }
        self.slots[slot_index] = Some(particle);
        self.active.push(slot_index);
        true
    }
}

/// Registry of per-emitter pools. Destroyed handles are not recycled, so a
/// stale handle can never start addressing a different emitter. The map only
/// retains live emitters, so repeated create/destroy cycles do not leak slots.
pub struct Particle2DManager {
    emitters: HashMap<u32, ParticleEmitter2D>,
    next_handle: u32,
}

impl Particle2DManager {
    pub fn new() -> Self {
        Self {
            emitters: HashMap::new(),
            next_handle: 1,
        }
    }

    pub fn create(&mut self, capacity: usize, texture: f64, width: u32, height: u32) -> u32 {
        if !(1..=MAX_CAPACITY).contains(&capacity)
            || !texture.is_finite()
            || texture <= 0.0
            || width == 0
            || height == 0
        {
            return 0;
        }
        let handle = self.next_handle;
        if handle == 0 {
            return 0;
        }
        self.next_handle = handle.checked_add(1).unwrap_or(0);
        self.emitters.insert(
            handle,
            ParticleEmitter2D::new(capacity, texture, width, height),
        );
        handle
    }

    pub fn get(&self, handle: u32) -> Option<&ParticleEmitter2D> {
        if handle == 0 {
            return None;
        }
        self.emitters.get(&handle)
    }

    pub fn get_mut(&mut self, handle: u32) -> Option<&mut ParticleEmitter2D> {
        if handle == 0 {
            return None;
        }
        self.emitters.get_mut(&handle)
    }

    pub fn destroy(&mut self, handle: u32) {
        if handle == 0 {
            return;
        }
        if let Some(mut emitter) = self.emitters.remove(&handle) {
            emitter.clear();
        }
    }
}

impl Default for Particle2DManager {
    fn default() -> Self {
        Self::new()
    }
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn normalize(value: [f32; 2], fallback: [f32; 2]) -> [f32; 2] {
    let length = (value[0] * value[0] + value[1] * value[1]).sqrt();
    if length > 0.000001 {
        [value[0] / length, value[1] / length]
    } else {
        fallback
    }
}

fn lerp(start: f32, end: f32, t: f32) -> f32 {
    start + (end - start) * t
}

fn advance_particle(particle: &mut Particle2D, dt: f32, acceleration: [f32; 2], drag: f32) -> bool {
    particle.age += dt;
    if particle.age >= particle.lifetime {
        return false;
    }
    let drag_factor = (-drag * dt).exp();
    particle.velocity[0] = (particle.velocity[0] + acceleration[0] * dt) * drag_factor;
    particle.velocity[1] = (particle.velocity[1] + acceleration[1] * dt) * drag_factor;
    particle.position[0] += particle.velocity[0] * dt;
    particle.position[1] += particle.velocity[1] * dt;
    particle.rotation_degrees += particle.spin_degrees_per_second * dt;
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transform() -> Particle2DTransform {
        Particle2DTransform::default()
    }

    fn config(frame_count: usize, space: f32) -> Vec<f32> {
        let mut values = vec![0.0; 31 + frame_count * 4];
        values[0] = 0.0; // continuous rate
        values[1] = 0.0; // point
        values[5] = 1.0; // lifetime min
        values[6] = 1.0; // lifetime max
        values[7] = 0.0; // speed min
        values[8] = 0.0; // speed max
        values[9] = 12.0; // start size min
        values[10] = 12.0; // start size max
        values[11] = 12.0; // end size min
        values[12] = 12.0; // end size max
        values[16..20].copy_from_slice(&[255.0, 255.0, 255.0, 255.0]);
        values[20..24].copy_from_slice(&[255.0, 255.0, 255.0, 0.0]);
        values[26] = 1.0; // default direction x
        values[28] = space;
        values[29] = 0.0; // no frame cycling
        values[30] = frame_count as f32;
        for frame in 0..frame_count {
            let offset = 31 + frame * 4;
            values[offset] = (frame * 16) as f32;
            values[offset + 1] = 0.0;
            values[offset + 2] = 16.0;
            values[offset + 3] = 16.0;
        }
        values
    }

    fn emitter(capacity: usize, space: f32) -> ParticleEmitter2D {
        let mut emitter = ParticleEmitter2D::new(capacity, 7.0, 64, 32);
        assert!(emitter.configure_from_slice(&config(2, space)));
        emitter
    }

    #[test]
    fn capacity_is_enforced_and_reclaimed_slots_are_reused() {
        let mut emitter = emitter(2, 0.0);
        let identity = transform();
        emitter.emit(10, [0.0, 0.0], [1.0, 0.0], identity);
        assert_eq!(emitter.live_count(), 2);
        let previously_active = emitter.active.clone();

        emitter.update(1.1, identity);
        assert_eq!(emitter.live_count(), 0);
        for index in &previously_active {
            assert!(emitter.free.contains(index));
        }

        emitter.emit(1, [4.0, 5.0], [1.0, 0.0], identity);
        assert_eq!(emitter.live_count(), 1);
        assert!(previously_active.contains(&emitter.active[0]));
    }

    #[test]
    fn lifetime_expires_particles_at_the_boundary() {
        let mut emitter = emitter(4, 0.0);
        let mut values = config(1, 0.0);
        values[5] = 0.25;
        values[6] = 0.25;
        assert!(emitter.configure_from_slice(&values));
        emitter.emit(3, [0.0, 0.0], [0.0, 1.0], transform());
        assert_eq!(emitter.update(0.24, transform()), 3);
        assert_eq!(emitter.update(0.01, transform()), 0);
    }

    #[test]
    fn acceleration_and_drag_integrate_motion() {
        let mut emitter = emitter(2, 0.0);
        let mut values = config(1, 0.0);
        values[5] = 4.0;
        values[6] = 4.0;
        values[7] = 2.0;
        values[8] = 2.0;
        values[13] = 2.0;
        values[14] = 0.0;
        assert!(emitter.configure_from_slice(&values));
        emitter.emit(1, [0.0, 0.0], [1.0, 0.0], transform());
        emitter.update(0.5, transform());
        let particle = emitter.slots[emitter.active[0]].as_ref().unwrap();
        assert!((particle.position[0] - 1.5).abs() < 0.0001);
        assert!((particle.velocity[0] - 3.0).abs() < 0.0001);

        let before_drag = particle.velocity[0];
        let mut values = config(1, 0.0);
        values[5] = 4.0;
        values[6] = 4.0;
        values[7] = 3.0;
        values[8] = 3.0;
        values[15] = 2.0;
        assert!(emitter.configure_from_slice(&values));
        emitter.clear();
        emitter.emit(1, [0.0, 0.0], [1.0, 0.0], transform());
        emitter.update(0.5, transform());
        let particle = emitter.slots[emitter.active[0]].as_ref().unwrap();
        assert!(particle.velocity[0] < before_drag);
    }

    #[test]
    fn atlas_frames_and_particle_visual_curves_are_exported_for_drawing() {
        let mut emitter = emitter(1, 0.0);
        let mut values = config(1, 0.0);
        values[5] = 2.0;
        values[6] = 2.0;
        values[9] = 10.0;
        values[10] = 10.0;
        values[11] = 20.0;
        values[12] = 20.0;
        values[16..20].copy_from_slice(&[200.0, 100.0, 50.0, 255.0]);
        values[20..24].copy_from_slice(&[100.0, 50.0, 25.0, 0.0]);
        values[31..35].copy_from_slice(&[8.0, 4.0, 32.0, 16.0]);
        assert!(emitter.configure_from_slice(&values));
        emitter.emit(1, [0.0, 0.0], [1.0, 0.0], transform());
        emitter.update(1.0, transform());

        let mut draws = Vec::new();
        emitter.for_each_draw(transform(), |draw| draws.push(draw));
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].source, [8.0, 4.0, 32.0, 16.0]);
        assert!((draws[0].width - 15.0).abs() < 0.001);
        assert!((draws[0].height - 7.5).abs() < 0.001);
        assert!((draws[0].color[0] - 150.0).abs() < 0.001);
        assert!((draws[0].color[3] - 127.5).abs() < 0.001);
    }

    #[test]
    fn local_space_follows_transform_and_world_space_stays_at_spawn_transform() {
        let mut local = emitter(1, 0.0);
        let mut values = config(1, 0.0);
        values[5] = 4.0;
        values[6] = 4.0;
        assert!(local.configure_from_slice(&values));
        local.emit(1, [1.0, 0.0], [1.0, 0.0], transform());
        let current = Particle2DTransform {
            position: [10.0, 20.0],
            rotation: std::f32::consts::FRAC_PI_2,
            scale: [2.0, 2.0],
        };
        let mut local_draw = None;
        local.for_each_draw(current, |draw| local_draw = Some(draw));
        let local_draw = local_draw.unwrap();
        assert!((local_draw.x - 10.0).abs() < 0.0001);
        assert!((local_draw.y - 22.0).abs() < 0.0001);

        let mut world = emitter(1, 1.0);
        values[28] = 1.0;
        assert!(world.configure_from_slice(&values));
        world.emit(1, [1.0, 0.0], [1.0, 0.0], current);
        let moved = Particle2DTransform {
            position: [100.0, 200.0],
            ..current
        };
        let mut world_draw = None;
        world.for_each_draw(moved, |draw| world_draw = Some(draw));
        let world_draw = world_draw.unwrap();
        assert!((world_draw.x - 10.0).abs() < 0.0001);
        assert!((world_draw.y - 22.0).abs() < 0.0001);
    }

    #[test]
    fn continuous_emission_respects_play_stop_and_capacity() {
        let mut emitter = emitter(5, 0.0);
        let mut values = config(1, 0.0);
        values[0] = 10.0;
        values[5] = 10.0;
        values[6] = 10.0;
        assert!(emitter.configure_from_slice(&values));
        emitter.play();
        assert_eq!(emitter.update(0.25, transform()), 2);
        emitter.stop();
        assert_eq!(emitter.update(1.0, transform()), 2);
    }

    #[test]
    fn continuous_particles_age_from_their_spawn_time_within_a_large_step() {
        let mut emitter = emitter(4, 0.0);
        let mut values = config(1, 0.0);
        values[0] = 10.0;
        values[5] = 4.0;
        values[6] = 4.0;
        values[7] = 2.0;
        values[8] = 2.0;
        assert!(emitter.configure_from_slice(&values));
        emitter.play();

        assert_eq!(emitter.update(0.25, transform()), 2);
        let first = emitter.slots[emitter.active[0]].as_ref().unwrap();
        let second = emitter.slots[emitter.active[1]].as_ref().unwrap();
        assert!((first.age - 0.15).abs() < 0.0001);
        assert!((second.age - 0.05).abs() < 0.0001);
        assert!((first.position[0] - 0.3).abs() < 0.0001);
        assert!((second.position[0] - 0.1).abs() < 0.0001);
    }

    #[test]
    fn clear_and_destroy_release_live_slots_and_handles() {
        let mut manager = Particle2DManager::new();
        assert_eq!(manager.create(0, 7.0, 64, 32), 0);
        assert_eq!(manager.create(MAX_CAPACITY + 1, 7.0, 64, 32), 0);
        assert_eq!(manager.create(1, f64::NAN, 64, 32), 0);
        assert_eq!(manager.create(1, 7.0, 0, 32), 0);
        let handle = manager.create(4, 7.0, 64, 32);
        manager
            .get_mut(handle)
            .unwrap()
            .configure_from_slice(&config(1, 0.0));
        manager
            .get_mut(handle)
            .unwrap()
            .emit(3, [0.0, 0.0], [1.0, 0.0], transform());
        manager.get_mut(handle).unwrap().clear();
        assert_eq!(manager.get(handle).unwrap().live_count(), 0);
        manager.destroy(handle);
        assert!(manager.get(handle).is_none());

        for _ in 0..32 {
            let transient = manager.create(1, 7.0, 64, 32);
            manager.destroy(transient);
        }
        assert!(
            manager.emitters.len() <= 1,
            "destroyed registry entries should be reclaimed"
        );
    }
}
