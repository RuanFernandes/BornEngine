//! Arguments passed between the renderer and its material backend.

use super::material_pipeline::{Bucket, FragmentProfile};
use super::material_system::MaterialHandle;

#[derive(Clone, Copy)]
pub struct MaterialCompileOptions {
    pub profile: FragmentProfile,
    pub bucket: Bucket,
    pub reads_scene: bool,
    pub wants_instancing: bool,
}

#[derive(Clone, Copy)]
pub struct MaterialTargetFormats {
    pub hdr: wgpu::TextureFormat,
    pub material: wgpu::TextureFormat,
    pub velocity: wgpu::TextureFormat,
    pub albedo: wgpu::TextureFormat,
    pub depth: wgpu::TextureFormat,
}

impl MaterialTargetFormats {
    pub fn standard() -> Self {
        Self {
            hdr: super::formats::HDR_FORMAT,
            material: super::formats::MATERIAL_FORMAT,
            velocity: super::formats::VELOCITY_FORMAT,
            albedo: wgpu::TextureFormat::Rgba8Unorm,
            depth: super::formats::DEPTH_FORMAT,
        }
    }
}

#[derive(Clone, Copy)]
pub struct FoliageParams {
    pub color: [f32; 3],
    pub amount: f32,
    pub wrap: f32,
}

#[derive(Clone, Copy)]
pub struct MaterialGpuContext<'a> {
    pub device: &'a wgpu::Device,
    pub queue: &'a wgpu::Queue,
    pub joint_buffer: &'a wgpu::Buffer,
}

#[derive(Clone, Copy)]
pub struct MaterialDrawParams {
    pub material: MaterialHandle,
    pub mesh_handle: u64,
    pub mesh_idx: usize,
    pub mvp: [[f32; 4]; 4],
    pub model: [[f32; 4]; 4],
    pub tint: [f32; 4],
    pub skin_info: [u32; 4],
}
