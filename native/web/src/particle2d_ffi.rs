//! Native CPU-backed 2D particle emitters for the WebGPU renderer.

use bloom_shared::particles2d::Particle2DTransform;
use wasm_bindgen::prelude::*;

use crate::engine;

#[wasm_bindgen]
pub fn bloom_particle2d_create(capacity: f64, texture: f64) -> f64 {
    if !capacity.is_finite() || capacity.fract() != 0.0 || !(1.0..=100_000.0).contains(&capacity) {
        return 0.0;
    }
    let eng = engine();
    let (width, height) = match eng.textures.get(texture) {
        Some(data) => (data.width, data.height),
        None => return 0.0,
    };
    eng.particles2d
        .create(capacity as usize, texture, width, height) as f64
}

#[wasm_bindgen]
pub fn bloom_particle2d_scratch_reset() {
    engine().particles2d_scratch.clear();
}

#[wasm_bindgen]
pub fn bloom_particle2d_scratch_push_f32(value: f64) {
    engine().particles2d_scratch.push(value as f32);
}

#[wasm_bindgen]
pub fn bloom_particle2d_configure(handle: f64) -> f64 {
    let eng = engine();
    let values = std::mem::take(&mut eng.particles2d_scratch);
    if let Some(emitter) = eng.particles2d.get_mut(handle as u32) {
        if emitter.configure_from_slice(&values) {
            return 1.0;
        }
    }
    web_sys::console::error_1(&"[particles2d] invalid emitter configuration".into());
    0.0
}

#[wasm_bindgen]
pub fn bloom_particle2d_emit(handle: f64, count: f64) {
    let eng = engine();
    let values = std::mem::take(&mut eng.particles2d_scratch);
    if values.len() != 9 {
        return;
    }
    let transform = Particle2DTransform {
        position: [values[4], values[5]],
        rotation: values[6],
        scale: [values[7], values[8]],
    };
    if let Some(emitter) = eng.particles2d.get_mut(handle as u32) {
        emitter.emit(
            (count as usize).min(100_000),
            [values[0], values[1]],
            [values[2], values[3]],
            transform,
        );
    }
}

#[wasm_bindgen]
pub fn bloom_particle2d_play(handle: f64) {
    if let Some(emitter) = engine().particles2d.get_mut(handle as u32) {
        emitter.play();
    }
}

#[wasm_bindgen]
pub fn bloom_particle2d_stop(handle: f64) {
    if let Some(emitter) = engine().particles2d.get_mut(handle as u32) {
        emitter.stop();
    }
}

#[wasm_bindgen]
pub fn bloom_particle2d_update(handle: f64, delta_time: f64) -> f64 {
    let eng = engine();
    let values = std::mem::take(&mut eng.particles2d_scratch);
    if values.len() != 5 {
        return 0.0;
    }
    let transform = Particle2DTransform {
        position: [values[0], values[1]],
        rotation: values[2],
        scale: [values[3], values[4]],
    };
    eng.particles2d
        .get_mut(handle as u32)
        .map(|emitter| emitter.update(delta_time as f32, transform) as f64)
        .unwrap_or(0.0)
}

#[wasm_bindgen]
pub fn bloom_particle2d_draw(handle: f64) {
    let eng = engine();
    let values = std::mem::take(&mut eng.particles2d_scratch);
    if values.len() != 5 {
        return;
    }
    let transform = Particle2DTransform {
        position: [values[0], values[1]],
        rotation: values[2],
        scale: [values[3], values[4]],
    };
    let bloom_shared::engine::EngineState {
        renderer,
        textures,
        particles2d,
        ..
    } = &mut *eng;
    let emitter = match particles2d.get(handle as u32) {
        Some(value) => value,
        None => return,
    };
    let texture = match textures.get(emitter.texture_handle) {
        Some(value) => value,
        None => return,
    };
    let texture_idx = texture.bind_group_idx;
    emitter.for_each_draw(transform, |draw| {
        renderer.draw_texture_pro(
            texture_idx,
            draw.source[0] as f64,
            draw.source[1] as f64,
            draw.source[2] as f64,
            draw.source[3] as f64,
            (draw.x - draw.width * 0.5) as f64,
            (draw.y - draw.height * 0.5) as f64,
            draw.width as f64,
            draw.height as f64,
            draw.width as f64 * 0.5,
            draw.height as f64 * 0.5,
            draw.rotation_degrees as f64,
            draw.color[0] as f64,
            draw.color[1] as f64,
            draw.color[2] as f64,
            draw.color[3] as f64,
        );
    });
}

#[wasm_bindgen]
pub fn bloom_particle2d_clear(handle: f64) {
    if let Some(emitter) = engine().particles2d.get_mut(handle as u32) {
        emitter.clear();
    }
}

#[wasm_bindgen]
pub fn bloom_particle2d_destroy(handle: f64) {
    engine().particles2d.destroy(handle as u32);
}

#[wasm_bindgen]
pub fn bloom_particle2d_live(handle: f64) -> f64 {
    engine()
        .particles2d
        .get(handle as u32)
        .map(|emitter| emitter.live_count() as f64)
        .unwrap_or(0.0)
}
