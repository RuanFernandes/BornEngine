use std::collections::HashMap;

use super::*;

pub(super) struct UiRendererState {
    egui_renderer: egui_wgpu::Renderer,
    pending_egui_frame: Option<(crate::ui::EguiFrameOutput, HashMap<u64, u32>)>,
    egui_texture_ids: HashMap<u64, (u32, egui::TextureId)>,
    egui_pending_frees: Vec<egui::TextureId>,
    #[cfg(feature = "debug-ui")]
    dear_imgui_renderer: Option<imgui_wgpu::Renderer>,
    #[cfg(feature = "debug-ui")]
    dear_imgui_textures: HashMap<u64, (u32, imgui::TextureId)>,
}

impl UiRendererState {
    pub(super) fn new(device: &wgpu::Device, output_format: wgpu::TextureFormat) -> Self {
        Self {
            egui_renderer: egui_wgpu::Renderer::new(
                device,
                output_format,
                egui_wgpu::RendererOptions::default(),
            ),
            pending_egui_frame: None,
            egui_texture_ids: HashMap::new(),
            egui_pending_frees: Vec::new(),
            #[cfg(feature = "debug-ui")]
            dear_imgui_renderer: None,
            #[cfg(feature = "debug-ui")]
            dear_imgui_textures: HashMap::new(),
        }
    }
}

fn should_render_ui(is_render_texture: bool) -> bool {
    !is_render_texture
}

#[cfg(feature = "debug-ui")]
fn imgui_texture_from_native(
    device: &wgpu::Device,
    renderer: &imgui_wgpu::Renderer,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> imgui_wgpu::Texture {
    use std::sync::Arc;

    let texture = Arc::new(texture.clone());
    let view = Arc::new(texture.create_view(&wgpu::TextureViewDescriptor::default()));
    let sampler_desc = wgpu::SamplerDescriptor {
        label: Some("bornengine_imgui_texture_sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::MipmapFilterMode::Linear,
        ..Default::default()
    };
    let config = imgui_wgpu::RawTextureConfig {
        label: Some("bornengine_imgui_native_texture"),
        sampler_desc,
    };
    imgui_wgpu::Texture::from_raw_parts(
        device,
        renderer,
        texture,
        view,
        None,
        Some(&config),
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    )
}

impl Renderer {
    pub fn set_egui_frame(
        &mut self,
        frame: crate::ui::EguiFrameOutput,
        native_texture_indices: HashMap<u64, u32>,
    ) {
        self.ui_renderer.pending_egui_frame = Some((frame, native_texture_indices));
    }

    #[cfg(feature = "debug-ui")]
    pub(crate) fn init_dear_imgui(&mut self) {
        // Headless renderers never submit the Dear ImGui surface pass. Avoid
        // creating a process-global ImGui context for offscreen renderers,
        // which can be constructed concurrently by tests or server tools.
        if self.surface.is_none() {
            return;
        }
        crate::ui::with_dear_imgui(|ui| {
            self.ui_renderer.dear_imgui_renderer = Some(imgui_wgpu::Renderer::new(
                ui.context_mut(),
                &self.device,
                &self.queue,
                imgui_wgpu::RendererConfig {
                    texture_format: self.output_format,
                    ..Default::default()
                },
            ));
        });
    }

    pub fn unload_egui_texture(&mut self, engine_handle: u64) {
        if let Some((_, texture_id)) = self.ui_renderer.egui_texture_ids.remove(&engine_handle) {
            self.ui_renderer.egui_renderer.free_texture(&texture_id);
        }
    }

    pub(crate) fn refresh_egui_texture_index(&mut self, texture_index: u32) {
        let affected: Vec<_> = self
            .ui_renderer
            .egui_texture_ids
            .iter()
            .filter_map(|(&handle, &(index, texture_id))| {
                (index == texture_index).then_some((handle, texture_id))
            })
            .collect();
        if affected.is_empty() {
            return;
        }
        let index = texture_index as usize;
        let Some(texture) = self.textures.get(index) else {
            return;
        };
        let size = self.texture_sizes.get(index).copied().unwrap_or_default();
        for (handle, texture_id) in affected {
            if size.0 == 0 || size.1 == 0 {
                self.ui_renderer.egui_renderer.free_texture(&texture_id);
                self.ui_renderer.egui_texture_ids.remove(&handle);
                continue;
            }
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            self.ui_renderer
                .egui_renderer
                .update_egui_texture_from_wgpu_texture(
                    &self.device,
                    &view,
                    wgpu::FilterMode::Linear,
                    texture_id,
                );
        }
    }

    pub fn unload_imgui_texture(&mut self, engine_handle: u64) {
        #[cfg(feature = "debug-ui")]
        if let (Some(renderer), Some((_, texture_id))) = (
            self.ui_renderer.dear_imgui_renderer.as_mut(),
            self.ui_renderer.dear_imgui_textures.remove(&engine_handle),
        ) {
            renderer.textures.remove(texture_id);
        }
        #[cfg(not(feature = "debug-ui"))]
        let _ = engine_handle;
    }

    pub(super) fn encode_egui_pass(
        &mut self,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        is_render_texture: bool,
    ) -> Vec<wgpu::CommandBuffer> {
        let Some((frame, native_texture_indices)) = self.ui_renderer.pending_egui_frame.take()
        else {
            return Vec::new();
        };

        for (texture_id, delta) in &frame.textures_delta.set {
            self.ui_renderer.egui_renderer.update_texture(
                &self.device,
                &self.queue,
                *texture_id,
                delta,
            );
        }

        for (engine_handle, texture_index) in native_texture_indices {
            let Some(texture) = self.textures.get(texture_index as usize) else {
                continue;
            };
            let Some(size) = self.texture_sizes.get(texture_index as usize) else {
                continue;
            };
            if size.0 == 0 || size.1 == 0 {
                continue;
            }

            let Some(existing) = self
                .ui_renderer
                .egui_texture_ids
                .get(&engine_handle)
                .copied()
            else {
                let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
                let texture_id = self.ui_renderer.egui_renderer.register_native_texture(
                    &self.device,
                    &view,
                    wgpu::FilterMode::Linear,
                );
                self.ui_renderer
                    .egui_texture_ids
                    .insert(engine_handle, (texture_index, texture_id));
                continue;
            };

            if existing.0 != texture_index {
                let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
                self.ui_renderer
                    .egui_renderer
                    .update_egui_texture_from_wgpu_texture(
                        &self.device,
                        &view,
                        wgpu::FilterMode::Linear,
                        existing.1,
                    );
                self.ui_renderer
                    .egui_texture_ids
                    .insert(engine_handle, (texture_index, existing.1));
            }
        }

        let can_paint = should_render_ui(is_render_texture) && self.surface.is_some();
        let mut user_command_buffers = Vec::new();
        if can_paint {
            let mut paint_jobs = frame.paint_jobs;
            for clipped in &mut paint_jobs {
                if let egui::epaint::Primitive::Mesh(mesh) = &mut clipped.primitive {
                    if let egui::TextureId::User(engine_handle) = mesh.texture_id {
                        if let Some((_, texture_id)) =
                            self.ui_renderer.egui_texture_ids.get(&engine_handle)
                        {
                            mesh.texture_id = *texture_id;
                        }
                    }
                }
            }

            let pixels_per_point = frame.pixels_per_point.max(0.1);
            let screen_descriptor = egui_wgpu::ScreenDescriptor {
                size_in_pixels: [self.surface_config.width, self.surface_config.height],
                pixels_per_point,
            };
            user_command_buffers = self.ui_renderer.egui_renderer.update_buffers(
                &self.device,
                &self.queue,
                encoder,
                &paint_jobs,
                &screen_descriptor,
            );

            if !paint_jobs.is_empty() {
                let pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("egui_ui_pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: target,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Load,
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                self.ui_renderer.egui_renderer.render(
                    &mut pass.forget_lifetime(),
                    &paint_jobs,
                    &screen_descriptor,
                );
            }
        }

        self.ui_renderer
            .egui_pending_frees
            .extend(frame.textures_delta.free.iter().copied());
        user_command_buffers
    }

    pub(super) fn free_pending_egui_textures(&mut self) {
        for texture_id in self.ui_renderer.egui_pending_frees.drain(..) {
            self.ui_renderer.egui_renderer.free_texture(&texture_id);
        }
    }

    #[cfg(feature = "debug-ui")]
    fn sync_dear_imgui_textures(
        &mut self,
        native_texture_indices: &HashMap<u64, u32>,
    ) -> HashMap<u64, (imgui::TextureId, [f32; 2])> {
        let mut texture_ids = HashMap::new();
        let Some(renderer) = self.ui_renderer.dear_imgui_renderer.as_mut() else {
            return texture_ids;
        };
        for (&engine_handle, &texture_index) in native_texture_indices {
            let index = texture_index as usize;
            let Some(texture) = self.textures.get(index) else {
                continue;
            };
            let Some(&(width, height)) = self.texture_sizes.get(index) else {
                continue;
            };
            if width == 0 || height == 0 {
                continue;
            }
            if let Some((cached_index, texture_id)) = self
                .ui_renderer
                .dear_imgui_textures
                .get(&engine_handle)
                .copied()
            {
                if cached_index == texture_index {
                    continue;
                }
                renderer.textures.remove(texture_id);
            }

            let imgui_texture =
                imgui_texture_from_native(&self.device, renderer, texture, width, height);
            let texture_id = renderer.textures.insert(imgui_texture);
            self.ui_renderer
                .dear_imgui_textures
                .insert(engine_handle, (texture_index, texture_id));
        }
        texture_ids.extend(self.ui_renderer.dear_imgui_textures.iter().filter_map(
            |(&handle, &(index, texture_id))| {
                let &(width, height) = self.texture_sizes.get(index as usize)?;
                (width > 0 && height > 0)
                    .then_some((handle, (texture_id, [width as f32, height as f32])))
            },
        ));
        texture_ids
    }

    #[cfg(feature = "debug-ui")]
    pub(crate) fn refresh_dear_imgui_texture_index(&mut self, texture_index: u32) {
        let Some(renderer) = self.ui_renderer.dear_imgui_renderer.as_mut() else {
            return;
        };
        let affected: Vec<_> = self
            .ui_renderer
            .dear_imgui_textures
            .iter()
            .filter_map(|(&handle, &(index, texture_id))| {
                (index == texture_index).then_some((handle, texture_id))
            })
            .collect();
        let index = texture_index as usize;
        let Some(texture) = self.textures.get(index) else {
            return;
        };
        let size = self.texture_sizes.get(index).copied().unwrap_or_default();
        for (handle, texture_id) in affected {
            if size.0 == 0 || size.1 == 0 {
                renderer.textures.remove(texture_id);
                self.ui_renderer.dear_imgui_textures.remove(&handle);
                continue;
            }
            let imgui_texture =
                imgui_texture_from_native(&self.device, renderer, texture, size.0, size.1);
            renderer.textures.replace(texture_id, imgui_texture);
        }
    }

    #[cfg(feature = "debug-ui")]
    pub(super) fn encode_dear_imgui_pass(
        &mut self,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        is_render_texture: bool,
        ui_system: &mut crate::ui::UiSystem,
        dt: f64,
        native_texture_indices: &HashMap<u64, u32>,
    ) {
        if is_render_texture || self.surface.is_none() {
            return;
        }
        if self.ui_renderer.dear_imgui_renderer.is_none() {
            return;
        }

        let commands = ui_system.take_commands(crate::ui::UiBackend::DearImGui);
        let texture_ids = self.sync_dear_imgui_textures(native_texture_indices);
        let input = ui_system.input_snapshot().clone();
        let display_size = [self.width().max(1) as f32, self.height().max(1) as f32];
        let framebuffer_scale = self.physical_width() as f32 / display_size[0];
        let (responses, capture) = crate::ui::with_dear_imgui(|ui| {
            if ui.register_fonts(&commands) {
                if let Some(renderer) = self.ui_renderer.dear_imgui_renderer.as_mut() {
                    renderer.reload_font_texture(ui.context_mut(), &self.device, &self.queue);
                }
            }
            let draw_data = ui.prepare_frame(
                &commands,
                &input,
                display_size,
                framebuffer_scale,
                dt,
                &texture_ids,
            );
            if draw_data.total_vtx_count > 0 {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("dear_imgui_debug_ui_pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: target,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Load,
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                if let Some(renderer) = self.ui_renderer.dear_imgui_renderer.as_mut() {
                    if let Err(error) =
                        renderer.render(draw_data, &self.queue, &self.device, &mut pass)
                    {
                        eprintln!("bloom: Dear ImGui rendering failed: {error}");
                    }
                }
            }
            ui.take_frame_readback()
        });
        ui_system.publish_completed_responses(crate::ui::UiBackend::DearImGui, responses);
        ui_system.set_capture(crate::ui::UiBackend::DearImGui, capture);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn ui_paint_is_skipped_for_render_texture_frames() {
        assert!(super::should_render_ui(false));
        assert!(!super::should_render_ui(true));
    }
}

impl Renderer {
    pub fn end_frame(&mut self) {
        self.end_frame_internal(None, 1.0 / 60.0, HashMap::new());
    }

    pub fn end_frame_with_ui(
        &mut self,
        ui: &mut crate::ui::UiSystem,
        dt: f64,
        native_texture_indices: HashMap<u64, u32>,
    ) {
        self.end_frame_internal(Some(ui), dt, native_texture_indices);
    }

    #[allow(unused_variables)]
    fn end_frame_internal(
        &mut self,
        ui: Option<&mut crate::ui::UiSystem>,
        dt: f64,
        native_texture_indices: HashMap<u64, u32>,
    ) {
        if !self.material_per_view_bg_live {
            self.refresh_material_per_view_bg();
        }
        // Flush pending joint matrices to GPU right before rendering
        self.flush_joint_matrices();
        // One pooled upload for every cached-model draw's uniforms.
        self.flush_model_uniforms();

        // Q1: If rendering to a texture, use the RT view. Otherwise use the surface.
        // We take ownership of the RT views (via Option::take) to avoid holding a
        // borrow on `self` while the rest of end_frame mutates it.
        let rt_color = self.rt_color_view.take();
        let rt_depth = self.rt_depth_view.take();
        let using_rt = rt_color.is_some();

        let surface_output = if using_rt {
            None
        } else {
            match self.acquire_frame() {
                Some(t) => Some(t),
                None => {
                    // Swapchain lost+reconfigured. Restore RT views if set.
                    self.rt_color_view = rt_color;
                    self.rt_depth_view = rt_depth;
                    return;
                }
            }
        };

        let view: wgpu::TextureView;
        let owned_depth_view: wgpu::TextureView;

        if let Some(ref rt_view) = rt_color {
            view = rt_view.clone();
            owned_depth_view = rt_depth.as_ref().unwrap().clone();
        } else {
            view = self
                .frame_texture(surface_output.as_ref().unwrap())
                .create_view(&wgpu::TextureViewDescriptor {
                    format: Some(self.output_format),
                    ..Default::default()
                });
            owned_depth_view = self
                .depth_texture
                .create_view(&wgpu::TextureViewDescriptor::default());
        }

        // Restore RT views so they persist across frames.
        self.rt_color_view = rt_color;
        self.rt_depth_view = rt_depth;

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("bloom_encoder"),
            });

        // Upload 2D data to persistent GPU buffers
        let has_2d = !self.vertices_2d.is_empty();
        if has_2d {
            let vb_size = std::mem::size_of_val(self.vertices_2d.as_slice());
            let ib_size = std::mem::size_of_val(self.indices_2d.as_slice());
            self.ensure_buffer_capacity_2d(vb_size, ib_size);
            self.queue.write_buffer(
                &self.persistent_vb_2d,
                0,
                bytemuck::cast_slice(&self.vertices_2d),
            );
            self.queue.write_buffer(
                &self.persistent_ib_2d,
                0,
                bytemuck::cast_slice(&self.indices_2d),
            );
        }

        // Upload 3D data to persistent GPU buffers
        let has_3d = !self.vertices_3d.is_empty();
        if has_3d {
            let vb_size = std::mem::size_of_val(self.vertices_3d.as_slice());
            let ib_size = std::mem::size_of_val(self.indices_3d.as_slice());
            self.ensure_buffer_capacity_3d(vb_size, ib_size);
            self.queue.write_buffer(
                &self.persistent_vb_3d,
                0,
                bytemuck::cast_slice(&self.vertices_3d),
            );
            self.queue.write_buffer(
                &self.persistent_ib_3d,
                0,
                bytemuck::cast_slice(&self.indices_3d),
            );
        }

        {
            // Only attach a depth target when we're drawing 3D. pipeline_2d is
            // depth-less; on some mobile Vulkan drivers (Adreno) pairing a
            // depth-less pipeline with a pass that carries a depth attachment
            // discards all draws silently. Matches the overlay_2d pass in
            // end_frame_with_scene, which also omits depth.
            let depth_attachment = if has_3d {
                Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &owned_depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                })
            } else {
                None
            };
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("bloom_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(self.clear_color),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: depth_attachment,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            // Draw 3D geometry first (with depth testing), batched by texture
            if has_3d {
                pass.set_pipeline(&self.pipeline_3d);
                pass.set_bind_group(0, &self.uniform_bind_group_3d, &[]);
                pass.set_bind_group(1, &self.lighting_bind_group, &[]);
                pass.set_bind_group(3, &self.joint_bind_group, &[]);
                pass.set_vertex_buffer(0, self.persistent_vb_3d.slice(..));
                pass.set_index_buffer(self.persistent_ib_3d.slice(..), wgpu::IndexFormat::Uint32);

                if self.draw_calls_3d.is_empty() {
                    // No draw calls tracked — draw all with white texture (backward compat)
                    pass.set_bind_group(2, &self.texture_bind_groups[0], &[]);
                    pass.draw_indexed(0..self.indices_3d.len() as u32, 0, 0..1);
                } else {
                    let num_calls = self.draw_calls_3d.len();
                    for i in 0..num_calls {
                        let call = &self.draw_calls_3d[i];
                        let next_start = if i + 1 < num_calls {
                            self.draw_calls_3d[i + 1].index_start
                        } else {
                            self.indices_3d.len() as u32
                        };
                        let count = next_start - call.index_start;
                        if count == 0 {
                            continue;
                        }
                        let tex_idx = call.texture_idx as usize;
                        if tex_idx < self.texture_bind_groups.len() {
                            pass.set_bind_group(2, &self.texture_bind_groups[tex_idx], &[]);
                        } else {
                            pass.set_bind_group(2, &self.texture_bind_groups[0], &[]);
                        }
                        pass.draw_indexed(call.index_start..next_start, 0, 0..1);
                    }
                }
            }

            // Draw cached models (static models with GPU-resident buffers).
            // Use the scene pipeline so PBR-style material bindings (base
            // color + normal map) apply — drawModel should behave the same
            // as attachModelToNode for PBR purposes.
            if !self.model_draw_commands.is_empty() {
                pass.set_pipeline(&self.scene_pipeline);
                pass.set_bind_group(1, &self.lighting_bind_group, &[]);
                pass.set_bind_group(3, &self.joint_bind_group, &[]);

                for cmd in &self.model_draw_commands {
                    if let Some(Some(meshes)) = self.model_gpu_cache.get(&cmd.cache_handle) {
                        if cmd.mesh_idx < meshes.len() {
                            let mesh = &meshes[cmd.mesh_idx];
                            pass.set_bind_group(
                                0,
                                &self.model_uniform_bind_groups[cmd.uniform_slot],
                                &[],
                            );
                            pass.set_bind_group(2, &mesh.material_bg, &[]);
                            pass.set_vertex_buffer(0, mesh.vb.slice(..));
                            pass.set_index_buffer(mesh.ib.slice(..), wgpu::IndexFormat::Uint32);
                            pass.draw_indexed(0..mesh.index_count, 0, 0..1);
                        }
                    }
                }
            }

            // Draw 2D geometry (no depth testing, always passes)
            if has_2d {
                pass.set_pipeline(&self.pipeline_2d);
                pass.set_vertex_buffer(0, self.persistent_vb_2d.slice(..));
                pass.set_index_buffer(self.persistent_ib_2d.slice(..), wgpu::IndexFormat::Uint32);

                let num_calls = self.draw_calls_2d.len();
                for i in 0..num_calls {
                    let call = &self.draw_calls_2d[i];
                    let next_start = if i + 1 < num_calls {
                        self.draw_calls_2d[i + 1].index_start
                    } else {
                        self.indices_2d.len() as u32
                    };
                    let count = next_start - call.index_start;
                    if count == 0 {
                        continue;
                    }

                    pass.set_bind_group(
                        0,
                        &self.uniform_bind_groups[call.uniform_idx as usize],
                        &[],
                    );
                    if (call.texture_idx as usize) < self.texture_bind_groups.len() {
                        pass.set_bind_group(
                            1,
                            &self.texture_bind_groups[call.texture_idx as usize],
                            &[],
                        );
                    }
                    pass.draw_indexed(call.index_start..next_start, 0, 0..1);
                }
            }
        }

        let ui_command_buffers =
            self.encode_egui_pass(&mut encoder, &view, using_rt || self.surface.is_none());
        #[cfg(feature = "debug-ui")]
        if let Some(ui) = ui {
            self.encode_dear_imgui_pass(
                &mut encoder,
                &view,
                using_rt || self.surface.is_none(),
                ui,
                dt,
                &native_texture_indices,
            );
        }
        self.queue.submit(
            ui_command_buffers
                .into_iter()
                .chain(std::iter::once(encoder.finish())),
        );
        self.free_pending_egui_textures();
        if let Some(out) = surface_output {
            self.present_frame(out);
        }
    }

    /// Like end_frame, but also renders retained scene graph nodes.
    pub fn end_frame_with_scene(
        &mut self,
        scene: &mut crate::scene::SceneGraph,
        profiler: &mut crate::profiler::Profiler,
    ) {
        self.end_frame_with_scene_internal(scene, profiler, None, 1.0 / 60.0, HashMap::new());
    }

    pub fn end_frame_with_scene_ui(
        &mut self,
        scene: &mut crate::scene::SceneGraph,
        profiler: &mut crate::profiler::Profiler,
        ui: &mut crate::ui::UiSystem,
        dt: f64,
        native_texture_indices: HashMap<u64, u32>,
    ) {
        self.end_frame_with_scene_internal(scene, profiler, Some(ui), dt, native_texture_indices);
    }
}
