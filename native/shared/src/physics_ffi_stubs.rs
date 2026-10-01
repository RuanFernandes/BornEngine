//! No-Jolt export surface for native builds that keep the 3D FFI available.
//!
//! Perry compiles package modules as a whole, so these tiny feature-off
//! exports keep 2D builds linkable without pulling the Jolt implementation.

#[doc(hidden)]
#[macro_export]
macro_rules! __bloom_physics_stub {
    ($name:ident($($arg:ident: f64),* $(,)?) -> f64) => {
        #[no_mangle]
        pub extern "C" fn $name($($arg: f64),*) -> f64 {
            $crate::ffi::feature_off_warn_once(stringify!($name), "jolt");
            0.0
        }
    };
    ($name:ident($($arg:ident: f64),* $(,)?)) => {
        #[no_mangle]
        pub extern "C" fn $name($($arg: f64),*) {
            $crate::ffi::feature_off_warn_once(stringify!($name), "jolt");
        }
    };
}

#[macro_export]
macro_rules! define_physics_ffi_stubs {
    () => {
        $crate::__bloom_physics_stub!(bloom_physics_create_world(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_destroy_world(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_set_gravity(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_get_gravity(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_optimize_broadphase(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_step(_p0: f64, _p1: f64, _p2: f64));
        $crate::__bloom_physics_stub!(bloom_physics_step_fixed(_p0: f64, _p1: f64, _p2: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_set_fixed_timestep(_p0: f64, _p1: f64, _p2: f64));
        $crate::__bloom_physics_stub!(bloom_physics_set_interpolation(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_get_step_alpha(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_set_layer_collides(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_get_layer_collides(_p0: f64, _p1: f64, _p2: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_count(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_active_body_count(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_box(_p0: f64, _p1: f64, _p2: f64, _p3: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_sphere(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_capsule(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_cylinder(_p0: f64, _p1: f64, _p2: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_scaled(_p0: f64, _p1: f64, _p2: f64, _p3: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_offset_com(_p0: f64, _p1: f64, _p2: f64, _p3: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_release(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_scratch_reset());
        $crate::__bloom_physics_stub!(bloom_physics_scratch_push_f32(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_scratch_push_u32(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_shape_convex_hull(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_mesh(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_heightfield(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_compound_begin());
        $crate::__bloom_physics_stub!(bloom_physics_compound_add_child(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64));
        $crate::__bloom_physics_stub!(bloom_physics_compound_end() -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_bounds(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_shape_volume(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_create(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_destroy(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_activate(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_deactivate(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_is_active(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_is_valid(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_position(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_rotation(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_set_position(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_rotation(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_transform(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_move_kinematic(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_get_linear_velocity(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_angular_velocity(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_point_velocity(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_set_linear_velocity(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_angular_velocity(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_add_force(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_add_impulse(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_add_torque(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_add_angular_impulse(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_add_force_at(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_add_impulse_at(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_friction(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_restitution(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_linear_damping(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_angular_damping(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_gravity_factor(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_ccd(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_motion_type(_p0: f64, _p1: f64, _p2: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_object_layer(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_is_sensor(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_allow_sleeping(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_set_shape(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_lock_rotation_axes(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_lock_translation_axes(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_get_mass(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_friction(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_restitution(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_get_object_layer(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_body_set_user_data(_p0: f64, _p1: f64, _p2: f64));
        $crate::__bloom_physics_stub!(bloom_physics_body_get_user_data(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_raycast(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_raycast_all(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_ray_hit_count() -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_ray_hit_body(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_ray_hit_axis(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_ray_hit_fraction(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_ray_hit_sub_shape(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_overlap_sphere(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_overlap_point(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_overlap_box(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64, _p11: f64, _p12: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_overlap_body(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_constraint_fixed(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_constraint_point(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_constraint_hinge(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64, _p11: f64, _p12: f64, _p13: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_constraint_slider(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64, _p11: f64, _p12: f64, _p13: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_constraint_distance(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_constraint_destroy(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_constraint_set_enabled(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_contact_count() -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_contact_field(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_clear_contacts(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_character_create(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64, _p11: f64, _p12: f64, _p13: f64, _p14: f64, _p15: f64, _p16: f64, _p17: f64, _p18: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_destroy(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_character_update(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64));
        $crate::__bloom_physics_stub!(bloom_physics_character_get_position(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_get_rotation(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_set_position(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_character_set_rotation(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64));
        $crate::__bloom_physics_stub!(bloom_physics_character_get_linear_velocity(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_set_linear_velocity(_p0: f64, _p1: f64, _p2: f64, _p3: f64));
        $crate::__bloom_physics_stub!(bloom_physics_character_get_ground_state(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_get_ground_normal(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_get_ground_position(_p0: f64, _p1: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_get_ground_body(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_character_set_shape(_p0: f64, _p1: f64));
        $crate::__bloom_physics_stub!(bloom_physics_soft_body_create(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64, _p11: f64, _p12: f64, _p13: f64, _p14: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_soft_body_vertex_count(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_soft_body_get_vertex(_p0: f64, _p1: f64, _p2: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_soft_body_set_vertex(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64));
        $crate::__bloom_physics_stub!(bloom_physics_soft_body_set_vertex_inv_mass(_p0: f64, _p1: f64, _p2: f64));
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_create(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64, _p5: f64, _p6: f64, _p7: f64, _p8: f64, _p9: f64, _p10: f64, _p11: f64, _p12: f64, _p13: f64, _p14: f64, _p15: f64, _p16: f64, _p17: f64, _p18: f64, _p19: f64, _p20: f64, _p21: f64, _p22: f64, _p23: f64, _p24: f64, _p25: f64, _p26: f64, _p27: f64, _p28: f64, _p29: f64, _p30: f64, _p31: f64, _p32: f64, _p33: f64, _p34: f64, _p35: f64, _p36: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_destroy(_p0: f64));
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_get_chassis(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_set_input(_p0: f64, _p1: f64, _p2: f64, _p3: f64, _p4: f64));
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_get_wheel_transform(_p0: f64, _p1: f64, _p2: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_get_engine_rpm(_p0: f64) -> f64);
        $crate::__bloom_physics_stub!(bloom_physics_vehicle_get_wheel_angular_velocity(_p0: f64, _p1: f64) -> f64);
    };
}
