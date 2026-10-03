# BornEngine — referência de contexto para modelos de linguagem

Este arquivo resume a API pública e as decisões de arquitetura do BornEngine para assistentes que escrevem, revisam ou documentam jogos com a engine. Ele corresponde ao código deste repositório; a versão do pacote verificada nesta revisão é `0.13.0`. Confirme sempre `package.json`, exports, implementação e exemplos antes de assumir que o número ou um comportamento continua atual.

## Regras para responder ou gerar código

1. **Use a API class-first atual.** Não gere a antiga API do BloomEngine com `initWindow`, `runGame`, `beginDrawing`, `loadTexture()` global ou handles numéricos. Ela não tem aliases de compatibilidade.
2. **Não passe `Game` para assets.** `Texture`, `Model`, `Font`, `Sound`, `Music` e recursos relacionados são criados por `game.assets` ou `scene.assets`. Por exemplo: `this.assets.loadTexture('assets/player.png')`. `Texture` não tem construtor público.
3. **Passe `Game` somente aos sistemas que precisam do contexto.** Entre eles estão `new Scene(game)`, `new PhysicsWorld(game, options)`, `new PhysicsWorld2D(game, options)` e `new ColyseusClient(game, endpoint)`.
4. **A atualização de cenas é explícita.** `Game.run()` avança o loop da aplicação e serviços da engine, mas não chama `game.scenes.update(dt)` nem agenda `updateFixed()`. A subclasse decide quando avançar cenas e sistemas de física.
5. **O desenho automático da cena depende do método base.** `Game.render()` desenha a cena atual. Se uma subclasse sobrescrever `render()`, chame `super.render()` no ponto em que os componentes da cena devem ser desenhados.
6. **Diferencie configuração de runtime e configuração de build.** `GameOptions.renderMode` escolhe o caminho de renderização em runtime. O perfil `[bornengine].native_profile` em `perry.toml` escolhe features Rust usadas pelo BornEngine CLI em builds nativos.
7. **Cheque falhas explicitamente.** A engine usa valores como `isReady`, `isLoaded`, `error`, `null` e resultados com `ok/status`. Leia o tipo da API e trate esses resultados; não presuma que toda factory lança exceções.
8. **Não prometa recursos só porque há uma spec antiga.** Para considerar algo público, confirme export em `package.json`/`src/index.ts`, implementação em `src/` e um caminho de uso atual. `docs/design/` e `docs/superpowers/` incluem propostas e planos históricos.
9. **Não invente capacidades de Perry nem de plataforma.** Use `bornengine check main.ts` ou os checks apropriados ao target antes de recomendar sintaxe, dependência ou API. A compatibilidade de Web, Apple e scripting tem diferenças descritas neste arquivo e nas páginas de plataforma.

## Arquitetura em uma frase

O código de jogo usa classes TypeScript; Perry compila esse código ahead-of-time e comunica-se com as camadas Rust por um FFI privado. Rust compartilhado fica em `native/shared/`; os crates `native/<platform>/` conectam o runtime ao host. Classes, services, factories e ownership são a API do jogo. Handles numéricos e funções FFI são detalhes internos e não devem aparecer em exemplos públicos.

O pacote verificado contém a versão `0.13.0`. Os exports públicos atuais estão em `package.json` e no barrel `src/index.ts`. O mapa estável de módulos aparece abaixo; confirme os exports nesses arquivos antes de adicionar uma importação.

## Criar um jogo

Uma aplicação standalone tem uma instância `Game` e pode concentrar o comportamento principal numa subclasse:

```ts
import { Colors, Game } from '@bornengine/engine';

class MyGame extends Game {
  constructor() {
    super({
      window: { title: 'My Game', width: 960, height: 540 },
      targetFps: 60,
      renderMode: '2d',
    });
  }

  protected override onStart(): void {
    // Criar/carregar recursos e ativar a cena inicial.
  }

  protected override loop(deltaTime: number): void {
    // deltaTime é medido em segundos.
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SNOW);
    super.render();
  }

  protected override onStop(): void {
    // Limpeza adicional da aplicação, antes do encerramento do Game.
  }
}

const game = new MyGame();
if (!game.isReady) console.error(game.error);
else game.run();
```

`Game` oferece `window`, `renderer`, `input`, `audio`, `scenes`, `sceneGraph`, `mobile`, `ui`, `debugUi`, `assets` e `scripting`. `run()` administra o frame e o encerramento standalone; `stop()` pede o encerramento ordenado; `dispose()` libera o runtime fora do ciclo normal. Um host que já possui a janela e o scheduler usa `runFrame(deltaTime, callbacks)`. Só pode haver um runtime nativo ativo por processo.

## Cenas, objetos e componentes

`Scene` é uma cena orientada a gameplay e requer o Game proprietário. `GameObject` representa entidade, hierarquia e transform; `GameComponent` fornece comportamento acoplável. Os principais hooks de objetos/componentes são `onAwake`, `onStart`, `update`, `fixedUpdate`, `render` e `onDestroy`.

```ts
import { Game, GameObject, Scene } from '@bornengine/engine';

class Level extends Scene {
  constructor(game: Game) {
    super(game, { name: 'Level' });
    const player = new GameObject({ name: 'Player', position: { x: 100, y: 100, z: 0 } });
    this.add(player);
  }
}

// Dentro de uma subclasse de Game:
// this.scenes.changeTo(new Level(this));
```

`game.scenes.changeTo(scene)` ativa a cena. Trocar ou descarregar a cena anterior chama o lifecycle de saída/descarte e libera `scene.assets`, `scene.vfx` e recursos registrados com `scene.own(resource)`. O objeto precisa pertencer a uma única cena; componentes são anexados a um único objeto.

`game.scenes.update(dt)` avança a cena ativa. `game.scenes.render(renderer)` é chamado pelo `Game.render()` base e desenha a cena ativa ou pausada. `scene.camera2D`, `scene.viewport2D` e `scene.bindCameraRig2D(rig)` configuram câmera e viewport para renderização e conversão de coordenadas.

Componentes visuais, como `SpriteRenderer`, `Tilemap` e `ParticleEmitter2D`, são desenhados automaticamente pela cena. A cena coleta componentes enabled de objetos ativos, ordena por `renderOrder` e preserva a ordem de inserção em empates. Ao sobrescrever `Game.render()`, limpe a tela e chame `super.render()` para manter esse desenho.

## Recursos e ownership

### Assets

- `game.assets`: cache e lifetime compartilhados pela aplicação; são liberados ao descartar o Game.
- `scene.assets`: recursos temporários de uma fase; são liberados no unload da cena.
- `AssetGroup`: preloads agrupados com progresso, resultados por asset e cancelamento.
- Factories comuns: `loadTexture(path)`, `loadModel(path)`, `loadFont(path, size)`, `loadSound(path)`, `loadMusic(path)`, `createMesh`, `createMaterial`, `createRenderTexture`.

Factories podem retornar `null`; recursos carregáveis também expõem `isLoaded` e `error`. O manager guarda identidade/cache, remove recursos descartados do seu inventário e libera o que ainda possui ao terminar o scope. Use o mesmo Game proprietário para componentes e recursos nativos relacionados.

```ts
const texture = this.assets.loadTexture('assets/player.png');
if (texture === null || !texture.isLoaded) {
  console.error(texture?.error || 'Could not load player texture');
}
```

`SpriteSheet` referencia uma `Texture`, mas não a descarta. Não use `new Texture(game, path)`; o construtor da textura é interno. Alguns sistemas semânticos, e não assets, recebem Game explicitamente, como os mundos de física e o cliente Colyseus.

### Efeitos

`scene.vfx.createParticleSystem(capacity, config)` e `createDecalSystem(capacity)` fornecem VFX 3D ligados ao lifetime da cena. Para partículas 2D, anexe `ParticleEmitter2D` a um `GameObject`; a cena atualiza, desenha e descarta o pool junto do componente. A capacidade default é 256 (máximo 100.000); o emitter recebe de 1 a 1.024 frames de uma única `SpriteSheet`. `emissionRate` habilita emissão contínua com `play()`; `emitBurst(count, { position, direction })` dispara um burst e `stop()` interrompe novas partículas sem apagar as vivas. A forma é point/circle/box/cone; configure faixas `lifetime`, `speed`, `startSize`, `endSize` e `spin`, além de `acceleration`, `drag`, cores RGBA no intervalo 0–255, `direction`, `frameRate` e espaço `local`/`world`. Defaults: vida de 1 s, velocidade zero, tamanho 8, direção para cima (`{ x: 0, y: -1 }`, pois a física 2D usa +Y para baixo) e espaço local. Com `frameRate: 0`, cada partícula mantém o frame aleatório escolhido no nascimento.

## API 2D

O foco atual de desenvolvimento da BornEngine é 2D. Use `Vector2D` para math e vetores 2D. A API também aceita objetos estruturais `{ x, y }` em vários parâmetros e dados serializados; prefira `Vector2D` para valores e operações do gameplay.

`Vector2D` é um valor mutável e oferece factories, getters e operações estáticas/de instância. Instância: `clone`, `set`, `copy`; getters `magnitude`, `sqrMagnitude`, aliases `length`/`lengthSquared` e `normalized`; operações `add`, `subtract`, `multiply`, `divide`, `scale`, `dotWith`, `crossWith`, `distanceTo`, `interpolatedTo`, `rotatedBy`, `clamped`, `clampedMagnitude`, `equals` e `equalsApprox`. Helpers estáticos: `zero`, `one`, `up`, `down`, `left`, `right`, `from`, `sum`, `difference`, `componentProduct`, `componentQuotient`, `scaled`, `normalize`, `magnitude`, `sqrMagnitude`, `dot`, `cross`, `distance`, `distanceSquared`, `min`, `max`, `clamp`, `clampMagnitude`, `lerp`, `lerpUnclamped`, `moveTowards`, `reflect`, `project`, `angle`, `signedAngle`, `rotate` e `perpendicular`. Operações que produzem um vetor retornam uma nova instância; `set`/`copy` mutam a instância e retornam `this`. `angle` e `signedAngle` retornam graus; `rotate` recebe radianos. `Vector2D.up()` significa +Y cartesiano, enquanto a física 2D da engine usa Y positivo para baixo; converta direções quando cruzar essas convenções.

### Sprites e animação

- `SpriteSheet(texture, options)` cria frames nomeados ou frames de grade com margem/espaçamento, pivot e dados de trim. O sheet não é dono da textura.
- `SpriteRenderer extends GameComponent` desenha frame, tamanho, pivot, tint, flips e visibilidade; mundo, escala e rotação Z do objeto são aplicados ao desenhar.
- `SpriteAnimation` contém keyframes, duração/FPS, markers e modo `loop`, `once` ou `ping-pong`.
- `SpriteAnimator` controla clips e estados por objeto, com parâmetros bool/number/trigger, condições AND, transições em ordem declarada e crossfade opcional.
- `onMarker`, `onComplete` e `onStateChanged` são hooks para gameplay e VFX. `seek()` não dispara markers por padrão. Um `dt` que atravessa vários frames preserva a ordem dos markers.
- Repetir `play()` no clip atual não reinicia sem `restart: true`; fade padrão tem duração zero.

Anexe renderer e animator ao mesmo `GameObject`. A cena cuida do update e draw quando o objeto está ativo. A `Animation` de modelos 3D permanece uma API separada.

### Física 2D, Tilemap e mapas

`PhysicsWorld2D` implementa um solver arcade determinístico em coordenadas pixel/secundo, com eixo Y positivo para baixo. Chame `step(deltaTime)` uma vez por update; ele acumula tempo e executa os substeps de corpos `PhysicsBody2D`. Corpos dinâmicos suportam caixas alinhadas aos eixos e círculos; segmentos e polígonos convexos são superfícies estáticas. Rotação/escalamento de colisor, joints 2D e pares dinâmicos poligonais não fazem parte desse solver.

`CharacterBody2D.moveAndSlide()` é controlado pelo jogo. Para disparar `GameObject.fixedUpdate()`/`GameComponent.fixedUpdate()`, implemente um accumulator e chame `this.scenes.updateFixed(fixedDt)` em cada tick fixo. `Game.run()` não cria esse scheduler.

`Tilemap` é um componente de cena com dados de tile e colisão. `World2DDocument` v1 é JSON versionado independente de `WorldData` 3D. Use `validateWorld2D`, `serializeWorld2D`, `World2DComponentRegistry` e `World2DLoader`; o loader recebe `resolveSpriteFrame` e, se houver corpos no documento, uma instância `PhysicsWorld2D` pronta. O importador CLI `bornengine import tiled <map.tmx> --output <world.world2d.json>` aceita mapas Tiled ortogonais finitos dentro do subconjunto documentado.

Não afirme que há uma classe pública `Navigation2D` nesta versão. Não há export/implementação dela no pacote verificado.

### Câmeras e viewport

`CameraRig2D` é componente para follow, dead zones, limites, zoom e shake. `Viewport2D` define resolução lógica e modo `fit`, `integer` ou `stretch`; `ParallaxLayer2D` aplica offsets de parallax. Uma `Camera2D` também pode ser configurada diretamente em `scene.camera2D`.

## API 3D e 2.5D

3D segue presente, mas não é a área principal de evolução da engine no momento. `Model`, `Mesh`, `Material` e `models.Animation` trabalham com assets de modelo. `game.sceneGraph` gerencia `SceneNode` retidos, hierarquia, geometria, material, luzes e picking. `WorldData`, `WorldInstance` e `PrefabLibrary` são os dados/runtime de mundo 3D; não são o formato de mapa World2D.

`PhysicsWorld(game, options)` usa o backend Jolt; para sincronizar GameObjects, conecte os adapters necessários e chame `world.step(dt)` pela gameplay. Registre um mundo de fase com `scene.own(world)` para liberar no unload. VFX 3D usam `scene.vfx`; não confundir `ParticleSystem` 3D com o `ParticleEmitter2D` de componente.

O `GameOptions.renderMode` aceita `2d`, `2.5d` e `3d` e escolhe o caminho de renderização em runtime. Para compilar menos código Rust em alvos nativos, use também o perfil CLI no `perry.toml`; `renderMode` sozinho não remove features do executável.

## Áudio, input, UI e debug

- Áudio: `game.audio` cria/carrega `Sound` e `Music`; `AudioEmitter2D` é um componente posicional 2D. Serviços de áudio avançam pelo loop do Game.
- Input: `game.input` lê teclado/mouse/gamepad e suporta `InputActionMap`. `game.mobile` fornece joystick e botões virtuais; `movementInput()` soma teclado, mas gamepad/joystick tem precedência acima do deadzone.
- UI: `game.ui` é a API de UI de jogo e deve ser separada da UI de diagnóstico.
- Debug: `game.debugUi` oferece inspector e janelas Dear ImGui. É opt-in e requer feature `debug-ui` nos builds nativos Linux/macOS/Windows. Não está disponível em Web, Apple mobile ou watchOS.

## Persistência SQLite

`GameDatabase` é uma camada SQLite tipada, com schemas explícitos (`defineSchema`, `defineTable`, `columns`), migrações (`defineMigration`), CRUD, filtros e transações. O schema TypeScript não cria tabelas sozinho; forneça migrações ordenadas. A API não aceita SQL arbitrário. Operações retornam `DatabaseResult`; cheque `ok` e `status`.

Persistent mode é o padrão nos targets suportados. No Web, cada database aberta tem seu Worker; usa OPFS quando a capacidade necessária existe e IndexedDB para snapshot quando OPFS não é suportado. Quota e eviction do browser continuam possíveis. `inMemory: true` escolhe armazenamento volátil. O arquivo SQLite não é criptografado; não guarde credenciais nele. Feche cada database para liberar worker/locks.

## Multiplayer com Colyseus

`ColyseusClient(game, endpoint)` gerencia conexões associados ao Game. Faça servidores autoritativos e envie intenção do jogador, não uma posição final que o servidor confia. A engine sincroniza dados da room, mas não cria `GameObject` automaticamente para cada entidade remota; mantenha uma camada de views e sincronize-a com os snapshots.

`Game.run()` bombeia o serviço Colyseus nos frames. Em jogos Perry nativos, o loop standalone bloqueia; use as APIs `joinOrCreateWithCallbacks()`/`requestWithCallbacks()` quando promises precisarem de um event loop que não está sendo cedido. Um host embedded deve continuar chamando `runFrame()`. Para limpar explicitamente, saia das rooms e descarte o cliente.

## Scripting sandbox

`game.scripting` cria `ScriptRuntime`; `ScriptComponent` recebe uma string com fonte JS autocontida e é anexado a um `GameObject`. Cada componente usa um runtime/heap QuickJS isolado. Permissões são negadas por padrão e concedidas explicitamente: `log`, `self.read`, `self.transform.write` e `self.particles.emit`.

O módulo guest é uma string JS autocontida com `export default { onStart(ctx), update(ctx, deltaTime), onDestroy(ctx) }`; todos os hooks são opcionais e síncronos. `ctx.log` exige `log`; `ctx.self.id/position` exige `self.read`; `ctx.self.setPosition/moveBy` exige `self.transform.write`; `ctx.particles.emitBurst(count, directionX?, directionY?)` exige `self.particles.emit` e um `ParticleEmitter2D` anexado ao mesmo objeto. Comandos são aplicados após o hook síncrono concluir; erro ou retorno de Promise falha o hook e descarta os comandos enfileirados nele. O script guest não recebe `Game`, renderer, handles nativos, módulos, filesystem, rede, workers, Node APIs nem `std`/`os` do QuickJS. Erros ficam em `status/error`. O limite de fonte é 1 MiB; limites padrão por componente são 16 MiB de heap, 256 KiB de stack e 10.000 interrupt checks por hook. Os intervalos aceitos são 64 KiB–64 MiB para heap, 16–256 KiB para stack e 1–1.000.000 checks. O código/manifesto não é carregado automaticamente pelo runtime. O host deve carregar ou embutir a fonte; atualmente a CLI não fornece `bornengine script check` ou `bornengine script pack`.

Alvos v1 validados: Linux nativo e Web/WASM. Outros alvos nativos e watchOS devem ser checados com `game.scripting.isSupported`; não os prometa como suportados. Esse isolamento é uma camada de containment para conteúdo de jogo, não uma fronteira formal de segurança contra vulnerabilidades da VM ou cliente multiplayer modificado.

## Perfis nativos e CLI

`bornengine create` é interativo e pede nome, tipo de jogo, package manager e versão estável da engine. `new` é a variante com nome e flags; `init` inicializa a pasta atual.

```sh
bornengine new MyGame --game-type 2d --package-manager pnpm --engine-version 0.13.0
bornengine check main.ts
bornengine run main.ts
bornengine dev main.ts --watch
bornengine build main.ts --os linux
```

`--game-type` aceita `2d`, `2.5d` e `3d` (alias `--kind`) e grava `[bornengine].native_profile` em `perry.toml`. O CLI aplica isso ao crate Rust do engine em builds nativos:

| Perfil | Features principais | Uso |
| --- | --- | --- |
| `2d` | `mp3` | Renderer 2D, sem Jolt e sem loader de modelos 3D |
| `2.5d` | `mp3`, `models3d`, `image-extras` | Modelos 3D sem Jolt |
| `3d` | `mp3`, `jolt`, `models3d`, `image-extras` | Modelo 3D e física Jolt |

Features extras podem ser adicionadas em `[bornengine].native_features`, por exemplo `debug-ui` em builds Linux/macOS/Windows. Direct Perry commands não leem o perfil; o target Web usa artefato WASM pré-compilado e não é reduzido por esses perfis. `bornengine dev` só observa/relança arquivos com `--watch`.

Não confunda comandos da engine com atualização da CLI:

- `bornengine engine install [version]`, `engine update`, `engine use` e `upgrade [version]` mudam a dependência BornEngine do projeto e seu lockfile.
- `bornengine engine list` lista releases disponíveis do registry; não é uma lista de engines instaladas num store local.
- `bornengine update` apenas consulta release da CLI e imprime a instrução de instalação; não atualiza o executável.
- `BORNENGINE_PATH` e `--engine-path` são entradas para `new`/`init`; `engine use <path>` recebe o path posicionalmente.
- Não há comando `bornengine script check` nem `bornengine script pack` na CLI publicada consultada nesta revisão.

## Targets e diferenças importantes

| Target | Notas de uso |
| --- | --- |
| Linux / Windows / macOS | Games nativos; a configuração de profile controla Cargo features da engine. `debug-ui` existe apenas nesses três crates. |
| Android / iOS / tvOS / visionOS / watchOS | Requer toolchains e configuração específicas. Consulte as páginas de plataforma antes de declarar compatibilidade; features opcionais variam. |
| Web/WASM | Perry + WASM do engine + glue JS. Exige WebGPU e adapter utilizável; o bootstrap atual não faz fallback WebGL. WASM publicado não é profile-pruned pelo CLI. |

Não há uma matriz geral de browsers mantida por esta referência. WebGPU depende do browser, sistema, GPU e aceleração de hardware; valide um adapter real no alvo.

## Mapa de imports do pacote

O import do root `@bornengine/engine` é apropriado para o código do jogo. Subpaths públicos para separar módulos:

| Subpath | Área |
| --- | --- |
| `@bornengine/engine/core` | `Game`, `Window`, `Renderer`, tipos de plataforma |
| `@bornengine/engine/game` | `GameObject`, `GameComponent`, `Scene`, `GameScene`, adapters |
| `@bornengine/engine/scene` | `SceneGraph`, `SceneNode` |
| `@bornengine/engine/assets` | `AssetManager`, `SceneAssetManager`, `AssetGroup` |
| `@bornengine/engine/textures` | `Texture`, `ImageData`, `RenderTexture` |
| `@bornengine/engine/sprites` | `SpriteSheet`, `SpriteRenderer`, `SpriteAnimation`, `SpriteAnimator`, `ParticleEmitter2D` |
| `@bornengine/engine/math` | `Vector2D`, `Vec3`, `Vec4`, `Quat`, `Matrix4`, `Mathf`, `Collision` |
| `@bornengine/engine/shapes` | Primitivas de desenho e colisão |
| `@bornengine/engine/camera2d` | `CameraRig2D`, `Viewport2D`, parallax |
| `@bornengine/engine/physics2d` | `PhysicsWorld2D`, `PhysicsBody2D`, `CharacterBody2D` |
| `@bornengine/engine/tilemap` | `Tilemap` |
| `@bornengine/engine/world2d` | `World2DDocument`, validation, serialization, loader |
| `@bornengine/engine/models` | `Model`, `Mesh`, `Material`, `Animation` 3D |
| `@bornengine/engine/physics` | `PhysicsWorld`, colliders, rigid bodies, Joints, vehicle |
| `@bornengine/engine/world` | `WorldData`, `WorldInstance`, prefab library |
| `@bornengine/engine/vfx` | `ParticleSystem` e `DecalSystem` 3D |
| `@bornengine/engine/text` | `Font` |
| `@bornengine/engine/audio` | `AudioSystem`, sounds, music, 2D emitters |
| `@bornengine/engine/input` | `InputSystem`, `InputActionMap` |
| `@bornengine/engine/mobile` | Joysticks e botões touch |
| `@bornengine/engine/ui` | UI de jogo |
| `@bornengine/engine/debug-ui` | Inspector Dear ImGui |
| `@bornengine/engine/storage` | `GameDatabase`, SQLite tipado |
| `@bornengine/engine/scripting` | `ScriptRuntime`, `ScriptComponent` |
| `@bornengine/engine/colyseus` | `ColyseusClient`, `Room` |

Este mapa é uma orientação; confirme cada nome com os exports atuais do pacote.

## Exemplos e documentação detalhada

Use os exemplos do próprio repositório como receitas que devem compilar com o código atual. Índice geral: [`examples/README.md`](examples/README.md).

- Começo rápido: [`quickstart`](webpage/src/content/docs/getting-started/quickstart.md)
- GameObjects e cenas: [`api/game`](webpage/src/content/docs/api/game.md)
- Ownership e preload: [`api/assets`](webpage/src/content/docs/api/assets.md)
- 2D completo: [`guides/2d-game`](webpage/src/content/docs/guides/2d-game.md)
- Sprites/animação/partículas: [`api/sprites`](webpage/src/content/docs/api/sprites.md)
- Física 2D: [`api/physics2d`](webpage/src/content/docs/api/physics2d.md)
- World2D/Tiled: [`api/world2d`](webpage/src/content/docs/api/world2d.md), [`cli/import`](webpage/src/content/docs/cli/import.md)
- 3D: [`api/models`](webpage/src/content/docs/api/models.md), [`api/physics`](webpage/src/content/docs/api/physics.md)
- SQLite: [`api/storage`](webpage/src/content/docs/api/storage.md)
- Colyseus: [`guides/multiplayer`](webpage/src/content/docs/guides/multiplayer.md)
- Sandbox: [`api/scripting`](webpage/src/content/docs/api/scripting.md), [`examples/scripting-sandbox`](examples/scripting-sandbox/README.md)
- Targets: [`platforms`](webpage/src/content/docs/platforms/index.md)

Para ver o estado real da API no checkout, comece por `package.json`, `src/index.ts`, a implementação específica em `src/<module>/`, `webpage/src/content/docs/` e um exemplo em `examples/`. Se a documentação e o runtime divergirem, trate código, exports e checks de compilação atuais como fonte de verdade e corrija a documentação.
