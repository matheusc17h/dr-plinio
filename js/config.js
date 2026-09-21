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
     `ini` e `fim` são segundos DENTRO do arquivo — o corte é
     feito na reprodução, então dá para ajustar o trecho sem
     reexportar nada. Todos são 9:16 (servem desktop e mobile).

     Para tirar um clipe: comente a linha.
     Para trocar o trecho: mexa em ini/fim.                     */
  heroPlaylist: [
    // Dr. Plínio trabalhando — plano fechado, luz do refletor
    { src: 'assets/video/hero-01.mp4', ini: 0.4, fim: 6.9, alt: 'Dr. Plínio Mota durante um procedimento' },

    // Dr. Plínio de perfil, atendendo
    { src: 'assets/video/hero-02.mp4', ini: 2.0, fim: 8.6, alt: 'Dr. Plínio Mota atendendo uma paciente' },

    // macro do sorriso finalizado
    { src: 'assets/video/hero-03.mp4', ini: 0.5, fim: 7.0, alt: 'Sorriso finalizado após clareamento de resinas' }
  ],

  /* Duração do crossfade entre clipes, em segundos. */
  heroFade: 0.9,

  /* Em conexão lenta ou com "economia de dados" ligada,
     toca só o primeiro clipe (evita baixar o resto).          */
  heroRespeitaDadosMoveis: true
};
