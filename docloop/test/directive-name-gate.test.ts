/**
 * Regression coverage for the "any `:word` is a directive attempt" crash.
 *
 * remark-directive's inline grammar parses ANY colon immediately followed by a
 * word character as a `textDirective` — not just our own `:mark[…]{#id}`
 * (src/anchor.ts). Before src/directive-gate.ts, loading a comment body
 * containing e.g. "note:check this" into Milkdown threw `MilkdownError:
 * Cannot match target parser for node: {type: "textDirective", ...}`, because
 * only "mark" has a registered ProseMirror schema. These tests pin: (1) which
 * patterns actually trigger the underlying parser behaviour, (2) that the gate
 * demotes them to literal text instead of crashing, and (3) that genuine
 * `:mark…` anchors are untouched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkStringify from 'remark-stringify';
import { getMarkdown } from '@milkdown/utils';
import { createDirectiveNameGate } from '../src/directive-gate';
import { createEditor, type DocloopEditor } from '../src/editor';

describe('remark-directive: bare `:word` is parsed as a directive attempt', () => {
  const proc = unified().use(remarkParse).use(remarkDirective);

  it.each([
    ['docloop:example echo hello', 'example'],
    ['note:check this', 'check'],
    ['type:string', 'string'],
    ['10:30am test', '30am'],
    ['a:b', 'b'],
  ])('%s -> textDirective(name=%s)', (input, name) => {
    const tree = proc.parse(input) as unknown as { children: Array<{ children: Array<{ type: string; name?: string }> }> };
    const names = tree.children[0].children.filter((n) => n.type === 'textDirective').map((n) => n.name);
    expect(names).toContain(name);
  });

  it('does NOT trigger when the colon is followed by a non-word character', () => {
    const tree = proc.parse('C:\\Users\\test') as unknown as { children: Array<{ children: Array<{ type: string }> }> };
    expect(tree.children[0].children.every((n) => n.type === 'text')).toBe(true);
  });
});

describe('createDirectiveNameGate: demotes unknown directives to literal text', () => {
  function gatedProcessor(knownNames: string[]) {
    return unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(createDirectiveNameGate(knownNames))
      .use(remarkStringify);
  }

  it('leaves no textDirective/leafDirective/containerDirective node for an unknown name', () => {
    const input = 'note:check this and more :weird[stuff]{#x} tail';
    const proc = gatedProcessor(['mark']);
    const tree = proc.runSync(proc.parse(input), input);
    const DIRECTIVE_TYPES = new Set(['textDirective', 'leafDirective', 'containerDirective']);
    const seen: string[] = [];
    const visit = (node: any) => {
      if (DIRECTIVE_TYPES.has(node.type)) seen.push(node.type);
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    expect(seen).toEqual([]);
    // and the literal text is preserved in the stringified output
    const out = String(proc.stringify(tree as any));
    expect(out).toContain('note');
    expect(out).toContain('check');
  });

  it('a known name (mark) is left as a real directive node', () => {
    const input = ':mark[hi]{#t1}';
    const proc = gatedProcessor(['mark']);
    const tree = proc.runSync(proc.parse(input), input) as any;
    const names: string[] = [];
    const visit = (node: any) => {
      if (node.type === 'textDirective') names.push(node.name);
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    expect(names).toEqual(['mark']);
  });

  it('gating is idempotent: re-parsing the stringified output demotes the same way', () => {
    const once = String(gatedProcessor(['mark']).processSync('note:check this'));
    const twice = String(gatedProcessor(['mark']).processSync(once));
    expect(twice).toBe(once);
  });
});

describe('createEditor: a comment body with a stray `:word` no longer crashes the read view', () => {
  let ed: DocloopEditor | null = null;
  afterEach(async () => {
    await ed?.destroy();
    ed = null;
  });

  it.each([
    'docloop:example echo hello',
    'note:check this',
    'type:string',
    '10:30am test',
  ])('loads %s as a read-only comment body without throwing', async (body) => {
    ed = await createEditor(document.createElement('div'), body, { editable: false });
    // The literal text content survives — nothing was silently dropped.
    const text = ed.view.state.doc.textContent;
    expect(text.replace(/\s+/g, ' ')).toContain(body.split(' ')[0]);
  });

  it.each(['10:30am test', 'note:check this', 'docloop:example echo hello', 'a:b c:d e:f'])(
    'load -> save -> reload -> save is a stable fixpoint for %s',
    async (md) => {
      const first = await createEditor(document.createElement('div'), md, { editable: false });
      const once = first.editor.action(getMarkdown());
      await first.destroy();

      const second = await createEditor(document.createElement('div'), once, { editable: false });
      const twice = second.editor.action(getMarkdown());
      ed = second;
      expect(twice).toBe(once);
    },
  );

  it('a genuine :mark[…]{#id} anchor still round-trips byte-clean alongside the gate', async () => {
    const md = 'See :mark[this span]{#t1} and note:check this too.';
    ed = await createEditor(document.createElement('div'), md, { editable: true });
    const out = ed.editor.action(getMarkdown());
    expect(out).toContain(':mark[this span]{#t1}');
    expect(out).toContain('note');
    expect(out).toContain('check');
  });
});
