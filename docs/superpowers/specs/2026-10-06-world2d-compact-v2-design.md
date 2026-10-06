# World2D v2: tileset principal, fontes extras e armazenamento compacto

## Estado e objetivo

Proposta para aprovação. Somente o desenho e o plano foram preparados;
nenhuma mudança de formato foi implementada.

O mapa deve admitir um tileset principal e tiles adicionais de outros atlas ou
imagens unitárias na mesma camada. O JSON deve ocupar o menor espaço entre as
representações suportadas, preservar todos os dados e continuar editável pelo
BornEngineTools. O editor deve suportar os mapas antigos e manter a pintura
responsiva. Esta proposta substitui o desenho anterior de paleta/RLE por linha.

## Escolha de abordagem

| Abordagem | Resultado | Decisão |
| --- | --- | --- |
| IDs numéricos, codecs adaptativos e grid binário comprimido dentro do JSON | Compacta mapas vazios, preenchidos, variados e com padrões repetidos; metadados continuam em JSON | Recomendada |
| IDs numéricos com arrays/RLE/sparse em JSON | Grid legível e bastante menor que células com objetos, mas perde a compactação binária | Disponível na saída legível |
| Comprimir o documento inteiro com um compressor externo | Esconde também metadados e requer uma ponte de descompressão que a engine não possui atualmente | Fora desta proposta |

A seleção mede o envelope completo de cada codec, incluindo paleta, nomes de
campos e Base64. O menor é escolhido por camada. O ganho depende do conteúdo;
não se fixa uma porcentagem para todos os mapas.

## Tileset principal e extras

- `tilesets[0]` é o tileset principal. Um mapa sem tilesets não possui principal.
- Os demais elementos são fontes extras: outro atlas regular ou uma imagem de
  um tile. Importar uma fonte adiciona somente seu descritor; não copia para o
  JSON uma definição de cada tile da imagem.
- O editor mostra a fonte principal e as extras, permite escolher qual fonte
  será a principal e mantém a seleção de tiles na imagem da fonte ativa.
- Tiles de várias fontes podem coexistir numa camada quando possuem a mesma
  dimensão de célula, conforme a regra atual do World2D.
- Tornar outra fonte principal reorganiza os descritores. As células continuam
  referenciando IDs estáveis em memória e são recodificadas na gravação; os
  tiles já colocados não mudam de imagem, ID, orientação ou tamanho.
- Imagens continuam como arquivos referenciados. O payload compacto contém
  somente dados de grid, sem incorporar pixels ao JSON.

## Códigos de tile

As fontes recebem intervalos consecutivos, derivados da ordem e de
`tileCount`, a partir de 1. Para fonte `s`, seu início é
`1 + soma(tileCount das fontes anteriores)`.

| Código | Significado |
| --- | --- |
| `0` | Célula vazia |
| `g > 0` | Tile sem flips; `g = inícioDaFonte + tileId` |
| `-(g * 8 + mask)` | Tile com flips; bits 1, 2 e 4 indicam X, Y e diagonal |

Um código negativo precisa ter `g > 0` e máscara entre 1 e 7. Todos os códigos
e somas precisam ser inteiros seguros; a soma dos `tileCount` não pode exceder
`floor((Number.MAX_SAFE_INTEGER - 7) / 8)`. Os intervalos não são IDs públicos:
o modelo em memória mantém `tilesetId`, `tileId` e os três booleans atuais.

Exemplo: principal com 16 tiles e fonte extra com 4 tiles. `1` é o primeiro
tile principal, `17` é o primeiro extra e `-137` é esse extra com flip X.

```json
{
  "format": "bornengine.world2d",
  "version": 2,
  "id": "town",
  "size": [4, 2],
  "tileSize": [16, 16],
  "tilesets": [
    { "id": "ground", "image": "assets/ground.png", "columns": 4, "tileCount": 16 },
    { "id": "details", "image": "assets/details.png", "columns": 2, "tileCount": 4 }
  ],
  "layers": [
    { "id": "floor", "type": "tilemap", "data": [1, 1, 17, 0, 2, 2, -137, 0] }
  ]
}
```

Esse exemplo é legível para explicar o contrato. A saída compacta padrão é
JSON minificado, e pode usar outro codec para `data` quando ele for menor.

## Codecs adaptativos por camada

Todos os grids são row-major. A dimensão vem de `size` da camada ou do mapa.
RLE atravessa limites de linha; não repete envelopes por linha.

| Codec | Forma de `data` | Decodificação |
| --- | --- | --- |
| Dense | `[code, ...]` | Um código por célula |
| RLE | `{ "encoding": "rle", "values": [count, code, ...] }` | Expande pares de quantidade e código |
| Sparse | `{ "encoding": "sparse", "base": code, "values": [gap, code, ...] }` | Preenche com `base` e aplica exceções; `base` ausente vale 0 |
| Bits | `{ "encoding": "bits", "palette": [code, ...], "values": "Base64" }` | Desempacota índices numa paleta local |
| LZ | `{ "encoding": "lz", "palette": [code, ...], "values": "Base64" }` | Descomprime bytes e aplica a mesma decodificação Bits |

### Regras comuns e determinismo

- Limite de 1.000.000 de células por camada, igual ao limite atual do editor.
- Dense deve ter exatamente `width * height` valores. RLE deve produzir
  exatamente essa quantidade, com contagens inteiras positivas.
- Sparse usa como base o código mais frequente; empate escolhe o menor código.
  A primeira posição é `-1`; cada exceção avança `gap + 1`. Gaps são inteiros
  não negativos, e a última posição precisa permanecer dentro do grid.
- A paleta local é ordenada por frequência decrescente, com empate pelo valor
  numérico. Seu tamanho não excede a quantidade de células.
- Bits usa `max(1, ceil(log2(palette.length)))` bits por índice. Os bits de
  cada índice são gravados do menos significativo ao mais significativo, em
  bytes consecutivos. Bits não usados no último byte são zero.
- Base64 usa o alfabeto padrão e padding canônico. Paleta, índices, padding e
  comprimento esperado são validados antes de produzir células. Bits exige
  exatamente `ceil(cellCount * bitsPerIndex / 8)` bytes; LZ limita a entrada a
  esse tamanho mais `ceil(tamanho / 8)` bytes de controle, antes de decodificar
  o Base64.
- Empates no tamanho usam a ordem Dense, RLE, Sparse, Bits, LZ.
- `effort: "fast"` considera Dense/RLE/Sparse/Bits. `effort: "max"` considera
  também LZ. O encoder LZ tem esforço limitado e determinístico.

### Contrato LZ portátil

O bloco LZ comprime os bytes do bitstream, com uma janela de 65.535 bytes.
Cada pacote começa com um byte de controle, lido da posição 0 à posição 7.
O valor 0 indica um literal de um byte; o valor 1 indica uma referência com três bytes:
distância unsigned de 16 bits em little-endian e comprimento menos 3 em um
byte. Distâncias válidas são 1..65.535, limitadas à saída já produzida, e
comprimentos são 3..258. Cópias sobrepostas são permitidas.

A quantidade descomprimida esperada é calculada das dimensões e da paleta;
nenhum comprimento arbitrário informado pelo payload determina a alocação.
O decoder rejeita referências inválidas, truncamento, saída excessiva, bytes
extras e bits de controle não usados diferentes de zero. Encoder e decoder
são TypeScript puro, síncrono, compatível com Perry e sem nova ponte nativa.

O encoder mantém um índice de sequências de três bytes e examina no máximo
64 candidatos recentes por posição. Usa o maior match; empate escolhe a menor
distância. Só emite referência se houver economia frente aos literais. Essa
regra limita o tempo de trabalho sem limitar o padrão espacial que pode ser
comprimido.

## Defaults e remoção de redundância

O modelo em memória continua completo. Somente a representação de disco
elide valores padrão e usa tuplas para geometria conhecida:

- `name` ausente vale o `id` correspondente; `metadata` ausente vale `{}`.
- `size: [width, height]` no mapa é a dimensão de camada mais frequente;
  empates seguem a primeira camada. Camadas diferentes guardam seu `size`.
- O `tileSize` comum considera tamanhos de fontes e camadas. Empate prefere o
  tamanho da fonte principal, depois o menor par largura/altura. Fontes e
  camadas diferentes guardam seu próprio `tileSize`.
- `visible: true`, `opacity: 1`, `offset: [0, 0]`, `parallax: [1, 1]`,
  `rotation: 0`, `origin: [0, 0]`, propriedades vazias, tags vazias e arrays
  vazios de componentes são omitidos quando equivalem ao valor normalizado.
- Nos tilesets, margem e espaçamento zero, `tiles: []`, `columns: 1` e
  `tileCount: 1` são omitidos. Colisões/propriedades particulares continuam
  explícitas; não se cria metadado vazio para todos os tiles do atlas.
- Vetores e retângulos conhecidos são tuplas de dois e quatro números na
  versão de disco; em memória continuam nas interfaces atuais.
- As imagens dos tilesets e propriedades tipadas como arquivo já declaram
  seus caminhos. `assets` na v2 guarda apenas declarações adicionais. O decoder
  restaura a união ordenada dessas referências e declarações. Assets extras
  declarados pelo usuário continuam preservados.
- JSON de componentes customizados e `metadata` são preservados sem reinterpretar
  strings como caminhos e sem truncar precisão numérica.

As dimensões são explícitas quando não há default aplicável; não dependem de
abrir a imagem nem de deduzir o tamanho do arquivo. Valores inválidos são
rejeitados antes de omitir defaults. Campos compactos e expandidos que
descrevam o mesmo dado com valores diferentes geram diagnóstico.

## API, migração e desempenho

`World2DDocument` e `World2DTileLayer.data` continuam como modelo normalizado.
O codec de disco possui tipos separados. `validateWorld2D`, `migrateWorld2D` e
`World2DLoader` aceitam v1 expandida e v2; `migrateWorld2D` devolve o modelo
normalizado na versão 2. Dados v1 inválidos não são corrigidos silenciosamente.

```ts
serializeWorld2D(input, {
  mode: 'compact', // padrão; 'readable' deixa o grid como números visíveis
  effort: 'max',   // padrão; 'fast' serve para edições contínuas
});
```

O saver mantém a emissão JSON explícita necessária à compilação Perry. Não
passa a depender de `JSON.stringify` para grafos completos.

Na extensão, pintura usa o caminho fast. Um worker local calcula a opção max
após 250 ms de inatividade e mantém somente a revisão mais recente. Salvar usa
o resultado max se ele corresponde exatamente à versão atual do documento.
Se não estiver pronto, solicita a revisão atual com prazo local de 750 ms no
evento de gravação; se não terminar a tempo, grava a representação fast válida. Um
comando **Optimize Map** permite aguardar a compactação max e salvar sua versão
atual. Uma revisão desatualizada nunca substitui edição ou texto novo.

Hover, seleção e ghost não executam compressão. Trocar a fonte principal
invalida os códigos/cache e recodifica a partir das células normalizadas.

Mapas antigos só mudam no próximo save ou Optimize Map; abrir para leitura
não regrava arquivos. Mapas v2 exigem uma versão da engine que suporte esse
contrato. A publicação permanece pendente de autorização específica para a
nova versão.

## Comparação de planejamento

Comparação local com o serializer v1 atual, em mapas sintéticos de 32×32 com
fonte principal e uma fonte extra. A coluna compacta mede só o envelope do
grid proposto, sem metadados, sem imagens e sem o candidato LZ. Ainda não é um
resultado da implementação nem uma medida do arquivo do usuário.

| Conteúdo | Documento v1 | Menor grid projetado |
| --- | ---: | ---: |
| Um tile preenchendo a camada | 104.410 bytes | 36 bytes, RLE |
| Padrão 2×2 repetido | 104.412 bytes | 395 bytes, Bits |
| Poucos tiles extras em fundo vazio | 16.382 bytes | 115 bytes, Sparse |
| Tiles variados com alguns extras | 106.018 bytes | 2.511 bytes, Bits |

## Critérios de aceitação

1. Principal e extras coexistem na mesma camada e escolher outro principal
   preserva a aparência e todas as células existentes.
2. Todo codec retorna os mesmos tiles, nulls, dimensões e flips; salvar/reabrir
   também preserva propriedades, assets, objetos e componentes customizados.
3. A escolha compacta usa o menor envelope gerado; arquivos minificados são
   determinísticos e a opção readable produz JSON com grid numérico.
4. Nos fixtures 32×32 de preenchimento, padrão, mapa esparso e mapa variado,
   o documento compacto inteiro fica no máximo com 20% do tamanho do v1.
   Os resultados em mapas reais são registrados como medidas, sem promessa
   universal de redução.
5. Payloads incompletos ou inválidos retornam diagnósticos sem gerar grids
   parciais, estourar a quantidade de células ou construir objetos de runtime.
6. Pintura e ghost não aguardam LZ; resultados de worker atrasados não sobrescrevem
   versões posteriores. Optimize Map conclui usando effort max ou mostra erro.
7. A engine, o editor, os exemplos de referência e a documentação apresentam
   o mesmo contrato v2, com suporte explícito à leitura v1.
