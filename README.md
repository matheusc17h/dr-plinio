# Dr. Plínio Mota — Odontologia Estética

Landing page estática. HTML + CSS + JS puro, GSAP (ScrollTrigger, Draggable) e Three.js.
Sem build, sem dependências para instalar — é só servir a pasta.

---

## ⚠️ Pendência antes de publicar

**Peso do vídeo** — o hero toca 3 clipes em sequência, mas os arquivos ainda
são os originais inteiros (8 MB somados) porque os cortes são feitos na
reprodução, não no arquivo. Só 1,5 MB é baixado de cara; o resto entra em
background. Passar o ffmpeg derruba isso para ~1,5 MB no total.
Veja *Vídeo do hero* abaixo.

O WhatsApp já está configurado: `(11) 97670-6634` → `5511976706634`, em
`js/config.js`. Se um dia voltar a ficar em branco ou como placeholder, o
console avisa e todo link `.js-wa` ganha `data-wa-placeholder="true"`.

---

## Rodar localmente

```bash
python -m http.server 8777
# http://127.0.0.1:8777
```

Precisa de servidor HTTP: o vídeo e o WebGL não funcionam bem via `file://`.

## Publicar

É um site estático — sobe em qualquer host (Netlify, Vercel, Hostinger, GitHub Pages).
Nada precisa ser compilado.

O `index.html` fica na **raiz do repositório**, que é onde todo host estático
procura por padrão. Na Vercel: importe o repositório, preset *Other*, e deixe
Root Directory, Build Command e Output Directory **vazios**. Se em alguma
tentativa anterior o Root Directory tiver sido apontado para `site`, limpe o
campo — essa pasta não existe mais.

---

## Estrutura

```
./
├─ index.html          seções 1–6, na ordem do briefing
├─ css/style.css       paleta, layout, responsivo, prefers-reduced-motion
├─ js/
│  ├─ config.js        ← WhatsApp e playlist do hero (único arquivo a editar)
│  ├─ scene.js         Three.js: campo de luz do hero
│  └─ main.js          GSAP: abertura, revelações, parallax, slider, cards
├─ assets/img/         imagens curadas e renomeadas
├─ assets/video/       hero-01/02/03.mp4 (playlist do hero)
└─ tools/hero-video.sh pipeline de corte do vídeo (precisa de ffmpeg)
```

Os vídeos brutos (~90 MB) não estão versionados. O `hero-video.sh` procura
por eles em `video-originais/` na raiz; para usar outro caminho, passe
`RAW=/caminho/dos/videos`.

---

## Identidade

Paleta tirada da logo:

| Token | Hex | Uso |
|-------|-----|-----|
| `--ink` | `#14141A` | fundos escuros (hero, técnica, rodapé) |
| `--graphite` | `#3D3D45` | cinza do monograma |
| `--gold` | `#C9A96A` | dourado da assinatura — acentos e itálicos |
| `--paper` | `#F5F4F1` | off-white do fundo da logo |

Tipografia: **Cormorant Garamond** (serifada de alto contraste, próxima do
lettering da logo) + **Jost** (geométrica, tracking largo, como o
"CIRURGIÃO-DENTISTA" da marca).

A logo original tinha fundo off-white opaco — virava um retângulo branco sobre
o escuro. Foram geradas versões com fundo transparente:
`logo.png` (escura), `logo-light.png` (clara), e os monogramas isolados
`logo-mark.png` / `logo-mark-light.png`, usados na nav.

---

## Vídeo do hero

**Decisão de enquadramento:** todos os takes originais são verticais 9:16.
Em vez de esticá-los num hero 16:9 (que cortaria demais), o desktop usa uma
**moldura retrato** ao lado do título e o mobile usa o vídeo **full-bleed**
atrás do texto. O mesmo arquivo 9:16 serve aos dois — não é preciso uma
versão 16:9.

### Playlist

O hero toca **3 clipes em sequência**, com crossfade de 0,9s, e repete.
Traços finos no rodapé da moldura mostram em que clipe você está.

| # | Arquivo | Origem | O que mostra |
|---|---------|--------|--------------|
| 1 | `hero-01.mp4` | `videoheader3.mp4` | Dr. Plínio trabalhando, plano fechado |
| 2 | `hero-02.mp4` | `montagemdevideos2.mp4` | Dr. Plínio de perfil, atendendo |
| 3 | `hero-03.mp4` | `videomae2.mp4` | macro do sorriso finalizado |

Os cortes (`ini`/`fim` em `js/config.js`) são aplicados **na reprodução** —
dá para reajustar o trecho de cada clipe sem reexportar nada. Para tirar um
clipe, comente a linha; para pôr outro, adicione um objeto ao array.

Só o primeiro clipe é baixado no carregamento; os outros entram enquanto o
anterior toca. Com "economia de dados" ligada ou conexão 2G/3G, toca só o
primeiro (`heroRespeitaDadosMoveis`). Com `prefers-reduced-motion`, nenhum
byte de vídeo é baixado — fica o poster.

### Os outros 14 vídeos, e por que ficaram de fora

Revisei todos, frame a frame:

- **Clínicos demais para um hero** (afastador, gel de barreira, isolamento):
  `clareamento-resina`, `cleareamento8`, `cleareamento-9`,
  `reultadodeclareamentos`, `resultado2`, `resultadofinalclareamento`,
  `finalizacaodeclareamento-9`. Funcionam em contexto de "a técnica",
  não como primeira impressão.
- **Plano parado, dentista de costas**: `videoheader5`, `montagemdevideos`.
- **Horizontal** (cortaria demais na moldura retrato): `videoparaheader2`.
- **Sem conteúdo aproveitável**: `videoparaheader` (parede),
  `videomae1` (pessoa no consultório, fora do tema).
- **Marca d'água embutida**: `resultado1` — o logo queimado no vídeo
  brigaria com a moldura.
- **Ambiente da clínica**: `WhatsApp Video 2026-09-18 at 09.30.02` (poltrona
  e parede de mármore). Bonito, mas estático; serve melhor na seção
  *Onde nos encontrar* do que no hero.

### Enxugar os arquivos (recomendado antes de publicar)

Precisa de ffmpeg:

```powershell
winget install --id Gyan.FFmpeg -e
```

Depois, no Git Bash:

```bash
cd tools
./hero-video.sh contatos                            # mosaicos de frames
./hero-video.sh corta videoheader3.mp4 0.4 6.5      # gera o corte já comprimido
```

Cortando os 3 clipes, o total cai de ~8 MB para ~1,5 MB. Depois é só apontar
`heroPlaylist` para os arquivos cortados e zerar `ini`.

## Seções

1. **Hero** — abertura GSAP (monograma se desenha → cortina abre → vídeo sobe →
   título linha a linha), vídeo responsivo, campo de luz WebGL reativo ao mouse.
2. **Sobre** — clareamento de resinas, parallax nas fotos, contadores.
3. **A técnica** — três etapas + comparativo Inicial/Imediato/Final.
4. **Resultados** — comparador antes/depois arrastável + galeria com tilt.
5. **Diferenciais** — cards arrastáveis na horizontal.
6. **Onde nos encontrar** — embed do Maps + botões Maps/Waze.

CTAs de WhatsApp: no hero, ao fim de *Sobre*, em *Onde nos encontrar*, na nav,
no menu mobile, no rodapé e no botão flutuante fixo.

---

## Detalhes de implementação

**Three.js** — um plano fullscreen com shader de cáusticas douradas no hero.
Não é enfeite: é a "luminosidade" do título. O foco de luz segue o cursor com
inércia, some conforme o hero sai de cena, e nasce do escuro durante a abertura.
Pausa sozinho fora da viewport e em aba oculta. Sem WebGL, cai para um gradiente
CSS.

**Acessibilidade** — `prefers-reduced-motion: reduce` desliga a abertura, o
parallax, o shader, o cursor custom e os tilts; o conteúdo aparece direto.
O comparador antes/depois é operável por teclado (setas, Shift+seta = passo
maior) e anuncia `aria-valuenow`.

**Cuidado ao editar** — os elementos com stagger de grupo (`.step`, `.gal__it`,
`.card`) **não** devem receber a classe `.rv`: as duas animações se sobrepõem e
o elemento fica com `opacity: 0`.
