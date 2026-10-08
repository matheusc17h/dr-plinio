/* ═══════════════════════════════════════════════════════════
   CONFIGURAÇÃO — edite só este arquivo para trocar dados
   ═══════════════════════════════════════════════════════════ */

window.CLINICA = {

  /* WhatsApp da clínica.
     Formato internacional, só dígitos: 55 + DDD + número.     */
  whatsapp: '5511976706634',

  /* Telefone exibido no rodapé (formato humano).
     Deixe '' para ocultar.                                    */
  telefoneExibido: '(11) 97670-6634',

  /* ── PLAYLIST DO HERO ──────────────────────────────────────
     Os clipes tocam em sequência com crossfade e repetem.
     `ini` e `fim` são segundos DENTRO do arquivo. Os arquivos já
     foram cortados no trecho que toca e comprimidos (1,8 MB os três),
     por isso começam em 0. Todos são 9:16 (servem desktop e mobile).
     Para usar outro trecho, reexportar do original com o ffmpeg
     (ver tools/hero-video.sh).

     Para tirar um clipe: comente a linha.
     Para trocar o trecho: mexa em ini/fim.                     */
  heroPlaylist: [
    // Dr. Plínio trabalhando — plano fechado, luz do refletor
    { src: 'assets/video/hero-01.mp4', ini: 0, fim: 6.5, alt: 'Dr. Plínio Mota durante um procedimento' },

    // Dr. Plínio de perfil, atendendo
    { src: 'assets/video/hero-02.mp4', ini: 0, fim: 6.6, alt: 'Dr. Plínio Mota atendendo uma paciente' },

    // vídeo enviado pelo cliente (21,3s): toca inteiro.
    { src: 'assets/video/hero-3.mp4', ini: 0, fim: 21.3, alt: 'Sorriso finalizado no consultório do Dr. Plínio Mota' }
  ],

  /* Duração do crossfade entre clipes, em segundos. */
  heroFade: 0.9,

  /* Em conexão lenta ou com "economia de dados" ligada,
     toca só o primeiro clipe (evita baixar o resto).          */
  heroRespeitaDadosMoveis: true
};
