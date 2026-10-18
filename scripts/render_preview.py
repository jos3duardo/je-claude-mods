"""Converte a árvore que o mod desenha (dump do kit de testes) em PNG/GIF com cara de terminal."""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

THEME = {'claude': '#d77757', 'success': '#4eba65', 'error': '#ff6b80', 'warning': '#ffc107'}
FG, DIM, BG = '#d4d4d4', '#7c7c8a', '#1e1e2e'
CODE_FG, COMMENT_FG = '#cdd6f4', '#a6e3a1'
CW, CH = 10, 20
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 15)
FONT_B = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 15)


def color(c):
    return THEME.get(c, c) if c else None


def style_of(props, base):
    s = dict(base)
    if props.get('color'):
        s['fg'] = color(props['color'])
    if props.get('backgroundColor'):
        s['bg'] = color(props['backgroundColor'])
    for k in ('bold', 'dimColor', 'inverse'):
        if k in props:
            s[k] = bool(props[k])
    return s


def inline(node, st):
    """Células (ch, estilo) de um Text/Button, com '\n' quebrando linha."""
    if isinstance(node, str):
        return [(ch, st) for ch in node]
    props = node.get('props') or {}
    st = style_of(props, st)
    kids = node.get('children')
    if node['type'] == 'Button' and not kids:
        kids = [props.get('label', '')]
    out = []
    for k in kids or []:
        out += inline(k, st)
    return out


def lines_of(cells):
    rows, cur = [], []
    for c in cells:
        if c[0] == '\n':
            rows.append(cur)
            cur = []
        else:
            cur.append(c)
    rows.append(cur)
    return rows


def truncate(row, width, mode):
    if width is None or len(row) <= width:
        return row
    if width <= 0:
        return []
    ell = ('…', row[0][1])
    if width == 1:
        return [ell]
    return [ell] + row[-(width - 1):] if mode == 'truncate-start' else row[:width - 1] + [ell]


def natural(node, st):
    return max((len(r) for r in block(node, None, st)), default=0)


def pad(rows, width):
    return [r + [(' ', {})] * (width - len(r)) for r in rows]


def block(node, width, st):
    """Linhas de células do nó, cabendo em `width` (None = largura natural)."""
    if isinstance(node, str):
        return truncate_rows(lines_of([(c, st) for c in node]), width, 'truncate-end')
    t, props = node['type'], node.get('props') or {}
    if t in ('Text', 'Button'):
        return truncate_rows(lines_of(inline(node, st)), width, props.get('wrap', 'truncate-end'))
    if t == 'Code':
        src = props.get('source', '').split('\n')
        start = props.get('startLine', 1)
        gw = len(str(start + len(src) - 1))
        rows = []
        for i, line in enumerate(src):
            gutter = [(ch, {**st, 'dimColor': True}) for ch in f'{start + i:>{gw}} ']
            code = {**st, 'fg': COMMENT_FG if line.lstrip().startswith('//') else CODE_FG}
            rows.append(gutter + [(ch, code) for ch in line])
        return truncate_rows(rows, width, 'truncate-end')
    # Box
    if props.get('width'):
        width = min(width, props['width']) if width else props['width']
    border = 1 if props.get('borderStyle') else 0
    px = props.get('paddingX', 0)
    ml, mr = props.get('marginLeft', 0), props.get('marginRight', 0)
    inner = None if width is None else max(0, width - 2 * border - 2 * px - ml - mr)
    kids = [k for k in node.get('children') or [] if k not in ('', None)]
    if props.get('flexDirection', 'row') == 'column':
        rows = []
        for k in kids:
            kp = k.get('props', {}) if isinstance(k, dict) else {}
            rows += [[] for _ in range(kp.get('marginTop', 0))]
            rows += block(k, inner, st)
            rows += [[] for _ in range(kp.get('marginBottom', 0))]
    else:
        rows = row_layout(kids, inner, st, props.get('justifyContent'))
    w = inner if (props.get('flexGrow') or props.get('width')) and inner is not None else max((len(r) for r in rows), default=0)
    rows = pad(rows, w)
    if border:
        bs = {**st, 'fg': DIM}
        rows = [[(' ', {})] * px + r + [(' ', {})] * px for r in rows]
        top = [('┌', bs)] + [('─', bs)] * (w + 2 * px) + [('┐', bs)]
        bot = [('└', bs)] + [('─', bs)] * (w + 2 * px) + [('┘', bs)]
        rows = [top] + [[('│', bs)] + r + [('│', bs)] for r in rows] + [bot]
    elif px:
        rows = [[(' ', {})] * px + r + [(' ', {})] * px for r in rows]
    return [[(' ', {})] * ml + r + [(' ', {})] * mr for r in rows]


def truncate_rows(rows, width, mode):
    return [truncate(r, width, mode) for r in rows]


def row_layout(kids, width, st, justify):
    sizes = []
    for k in kids:
        kp = k.get('props', {}) if isinstance(k, dict) else {}
        grow = kp.get('flexGrow', 0)
        sizes.append(None if grow else natural(k, st))
    fixed = sum(s for s in sizes if s is not None)
    free = None if width is None else max(0, width - fixed)
    blocks = []
    for k, s in zip(kids, sizes):
        kp = k.get('props', {}) if isinstance(k, dict) else {}
        if s is None:
            w = free
        elif width is not None and kp.get('flexShrink', 1) and fixed > width:
            # Encolhe quem pode encolher até caber
            w = max(0, s - (fixed - width))
            fixed -= s - w
        else:
            w = s
        blocks.append(pad(block(k, w, st), w if w is not None else 0))
    gap = 0
    if justify == 'space-between' and width is not None and len(blocks) > 1:
        used = sum(len(b[0]) if b else 0 for b in blocks)
        gap = max(0, width - used) // (len(blocks) - 1)
    h = max((len(b) for b in blocks), default=0)
    out = []
    for y in range(h):
        line = []
        for i, b in enumerate(blocks):
            bw = len(b[0]) if b else 0
            line += b[y] if y < len(b) else [(' ', {})] * bw
            if gap and i < len(blocks) - 1:
                line += [(' ', {})] * gap
        out.append(line)
    return out


def paint(rows, title, cols):
    rows = pad(rows, cols)
    head = 2
    img = Image.new('RGB', ((cols + 4) * CW, (len(rows) + head + 2) * CH), BG)
    d = ImageDraw.Draw(img)
    # Moldura do painel com o título, como o Claude Code desenha
    d.rounded_rectangle([CW // 2, CH // 2, img.width - CW // 2, img.height - CH // 2], radius=8, outline='#45475a', width=2)
    if title:
        d.text((2 * CW, CH // 2 + 4), f' {title} ', font=FONT_B, fill=THEME['claude'])
    for y, row in enumerate(rows):
        for x, (ch, s) in enumerate(row):
            X, Y = (x + 2) * CW, (y + head) * CH
            fg = s.get('fg') or FG
            bg = s.get('bg')
            if s.get('inverse'):
                fg, bg = (bg or BG), (s.get('fg') or FG)
            if s.get('dimColor') and ch not in '▀▄█':
                fg = DIM
            if bg:
                d.rectangle([X, Y, X + CW - 1, Y + CH - 1], fill=bg)
            if ch == '█':
                d.rectangle([X, Y, X + CW - 1, Y + CH - 1], fill=fg)
            elif ch == '▀':
                d.rectangle([X, Y, X + CW - 1, Y + CH // 2 - 1], fill=fg)
            elif ch == '▄':
                d.rectangle([X, Y + CH // 2, X + CW - 1, Y + CH - 1], fill=fg)
            elif ch == '░':
                d.rectangle([X, Y + 3, X + CW - 1, Y + CH - 4], fill='#3b3b4f')
            elif ch != ' ':
                d.text((X, Y + 1), ch, font=FONT_B if s.get('bold') else FONT, fill=fg)
    return img


def load(path):
    """Cenas do log: nome -> (largura em colunas, árvore). Linha `DUMP <nome> <colunas> <json>`."""
    dumps = {}
    with open(path, encoding='utf-8') as log:
        for line in log:
            if line.startswith('DUMP '):
                _, name, cols, tree = line.rstrip('\n').split(' ', 3)
                dumps[name] = (int(cols), json.loads(tree))
    return dumps


def scene(dumps, name, title):
    cols, tree = dumps[name]
    return paint(block(tree, cols, {}), title, cols)


if __name__ == '__main__':
    dumps, out = load(sys.argv[1]), sys.argv[2]
    agents = sorted((k for k in dumps if k.startswith('agentes-')), key=lambda k: int(k.split('-')[1]))
    # Confere tudo antes de gravar: cena faltando não deixa docs/ meio novo, meio antigo
    missing = [k for k in ('tarefas', 'arvore') if k not in dumps] + ([] if agents else ['agentes-*'])
    if missing:
        sys.exit(f'cenas ausentes no log: {", ".join(missing)}')
    frames = [scene(dumps, k, 'Subagentes') for k in agents]
    # Paleta única e sem pontilhado: o GIF fica pequeno e as cores, chapadas como no terminal
    pal = frames[0].quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE)
    gif = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    gif[0].save(f'{out}/agentes.gif', save_all=True, append_images=gif[1:], duration=400, loop=0, optimize=True, disposal=1)
    scene(dumps, 'tarefas', None).save(f'{out}/tarefas.png')
    scene(dumps, 'arvore', 'Arquivos').save(f'{out}/arvore.png')
