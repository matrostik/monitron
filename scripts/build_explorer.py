import json
import re

screens = {
    'industrial': open('docs/redesign-proposals/screen-variant-industrial.html', 'r', encoding='utf-8').read(),
    'amber': open('docs/redesign-proposals/screen-variant-amber-phosphor.html', 'r', encoding='utf-8').read(),
    'cyan-main': open('docs/redesign-proposals/screen-1-main-dashboard.html', 'r', encoding='utf-8').read(),
    'cyan-inputs': open('docs/redesign-proposals/screen-3-inputs.html', 'r', encoding='utf-8').read(),
    'cyan-settings': open('docs/redesign-proposals/screen-2-settings.html', 'r', encoding='utf-8').read(),
}

# Safely escape forward slashes or </script> tags so the HTML parser does not prematurely terminate the <script> block
safe_json = json.dumps(screens)
safe_json = re.sub(r'</script', r'<\\/script', safe_json, flags=re.IGNORECASE)
safe_json = re.sub(r'<!--', r'<\\!--', safe_json)

html_content = f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitron - Design Variants Explorer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {{
      background-color: #07090D;
      color: #E0E2EA;
      font-family: 'Inter', sans-serif;
    }}
    .variant-btn {{
      transition: all 0.15s ease-in-out;
    }}
    .variant-btn.active {{
      background-color: #1E293B;
      color: #FFFFFF;
      font-weight: 600;
      border-color: rgba(255, 255, 255, 0.4);
      box-shadow: 0 0 16px rgba(0, 0, 0, 0.6);
    }}
    .variant-btn.active[data-accent="orange"] {{
      border-color: rgba(255, 69, 0, 0.8);
      color: #FF5722;
      background-color: rgba(255, 69, 0, 0.12);
      box-shadow: 0 0 16px rgba(255, 69, 0, 0.35);
    }}
    .variant-btn.active[data-accent="amber"] {{
      border-color: rgba(255, 176, 0, 0.8);
      color: #FFB000;
      background-color: rgba(255, 176, 0, 0.12);
      box-shadow: 0 0 16px rgba(255, 176, 0, 0.35);
    }}
    .variant-btn.active[data-accent="cyan"] {{
      border-color: rgba(6, 182, 212, 0.8);
      color: #38BDF8;
      background-color: rgba(6, 182, 212, 0.12);
      box-shadow: 0 0 16px rgba(6, 182, 212, 0.3);
    }}
  </style>
</head>
<body class="min-h-screen flex flex-col m-0 p-0 overflow-hidden">
  <!-- Top Navigation & Switcher Bar -->
  <header class="bg-[#0E1015] border-b border-slate-800 z-50 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold font-mono text-sm">
        M
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="font-semibold text-white tracking-tight text-sm">Monitron UI Explorer</span>
          <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 font-semibold">5 Designs Available</span>
        </div>
        <p class="text-xs text-slate-400" id="currentThemeDesc">Variant A: Warm Milled Aluminum &amp; Safety Orange (Teenage Engineering / Dieter Rams Braun)</p>
      </div>
    </div>

    <!-- Screen Switcher Tabs -->
    <nav class="flex items-center gap-1.5 bg-[#050608] p-1 rounded-xl border border-slate-800 shadow-inner flex-wrap">
      <!-- Variant 1: Industrial Studio -->
      <button onclick="selectVariant('industrial', this, 'orange', 'Variant A: Precision Instrument Studio — Warm milled aluminum, matte black keycaps, safety orange &amp; cadmium yellow, Swiss DIN labels, mechanical fader with VU-meter ladder.')" 
              data-accent="orange" 
              class="variant-btn active px-3 py-1.5 rounded-lg text-xs font-medium border border-transparent transition-all flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_#FF4500]"></span>
        <span>Variant A: Industrial (Braun)</span>
      </button>

      <!-- Variant 2: Amber Phosphor Avionics -->
      <button onclick="selectVariant('amber', this, 'amber', 'Variant B: Amber Phosphor Cyber-Avionics — Deep pitch carbon void, 590nm glowing amber phosphor, oscilloscope waveform, 270° circular radar dials, CRT scanlines.')" 
              data-accent="amber" 
              class="variant-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-transparent transition-all flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#FFB000]"></span>
        <span>Variant B: Amber Avionics</span>
      </button>

      <!-- Variant 3: Dark Slate / Electric Cyan -->
      <button onclick="selectVariant('cyan-main', this, 'cyan', 'Variant C: Precision Optics Dark Utility — Translucent frosted slate glass (#101419), electric cyan (#06B6D4) and emerald accents, native macOS utility feel.')" 
              data-accent="cyan" 
              class="variant-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-transparent transition-all flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
        <span>Variant C: Precision Optics</span>
      </button>

      <!-- Subscreen: Inputs Tab -->
      <button onclick="selectVariant('cyan-inputs', this, 'cyan', 'Inputs &amp; Topology View — Dedicated 32:9 curved ultrawide visualizer, live telemetry, and multi-port source matrix.')" 
              data-accent="cyan" 
              class="variant-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-transparent transition-all">
        Inputs View
      </button>

      <!-- Subscreen: Settings Modal -->
      <button onclick="selectVariant('cyan-settings', this, 'cyan', 'Settings &amp; Preferences Modal — 4-tab preferences modal for appearance, step sizes, custom port names, and global shortcuts.')" 
              data-accent="cyan" 
              class="variant-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-transparent transition-all">
        Settings Modal
      </button>
    </nav>
  </header>

  <!-- Screen Preview Frame (Renders completely inline via srcdoc) -->
  <main class="flex-1 w-full bg-[#07090D] relative overflow-hidden">
    <iframe id="previewFrame" class="w-full h-full border-0 absolute inset-0" title="Screen Preview"></iframe>
  </main>

  <!-- Inline Templates for Instant Rendering -->
  <script>
    const screenData = {safe_json};

    function selectVariant(key, btn, accent, desc) {{
      const frame = document.getElementById('previewFrame');
      const html = screenData[key];
      if (html) {{
        frame.srcdoc = html;
      }}
      document.getElementById('currentThemeDesc').textContent = desc;
      document.querySelectorAll('.variant-btn').forEach(b => {{
        b.classList.remove('active');
        b.classList.add('text-slate-400');
      }});
      btn.classList.add('active');
      btn.classList.remove('text-slate-400');
    }}

    // Initialize with first variant on page load
    window.addEventListener('DOMContentLoaded', () => {{
      const frame = document.getElementById('previewFrame');
      if (screenData['industrial']) {{
        frame.srcdoc = screenData['industrial'];
      }}
    }});
  </script>
</body>
</html>
"""

with open('docs/redesign-proposals/index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print('Successfully written safe self-contained index.html')
