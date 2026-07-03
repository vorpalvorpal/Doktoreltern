/**
 * A "/" trigger dropdown for docloop skill commands, in the compose box (see
 * main.ts mountCompose). Built directly on `@milkdown/plugin-slash`'s
 * `SlashProvider` — a standalone class handling trigger detection and
 * floating-ui positioning — rather than the package's `slashFactory`/ctx
 * machinery, which expects a ctx-configuration hook `createEditor` (src/editor.ts)
 * doesn't expose. `SlashProvider` needs no such hook: it's plain, so it drops
 * straight into a hand-rolled ProseMirror `Plugin` following this codebase's
 * existing pattern for extra editor plugins (see deco-plugin.ts). The package
 * supplies positioning only — the dropdown's content, filtering, keyboard
 * navigation, and insert-on-select are all ours.
 */
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { SlashProvider } from '@milkdown/plugin-slash';
import type { SkillMeta } from './skills-client';

export const slashMenuPluginKey = new PluginKey('docloop-slash-menu');

/** Matches a slash command still being typed, right at the cursor: `/`, `/e`, `/example`, … */
const TRIGGER_RE = /(?:^|\s)\/(\w*)$/;

/** The text of the current text block up to the cursor (bounded, cheap). */
function textBeforeCursor(view: EditorView): string {
  const { $from } = view.state.selection;
  return $from.parent.textBetween(Math.max(0, $from.parentOffset - 60), $from.parentOffset, undefined, '￼');
}

/** The in-progress query (`"exam"` for `/exam`), or null if the cursor isn't in a slash command right now. */
function currentQuery(view: EditorView): string | null {
  const match = TRIGGER_RE.exec(textBeforeCursor(view));
  return match ? match[1] : null;
}

/**
 * Build the plugin. `commands` is read fresh on every trigger (not captured
 * once) so a compose box created before the skill list finishes loading
 * still picks it up.
 */
export const slashMenuPlugin = (commands: () => SkillMeta[]) =>
  $prose(() => {
    let provider: SlashProvider;
    let items: SkillMeta[] = [];
    let selected = 0;

    const menu = document.createElement('div');
    menu.className = 'slash-menu';

    const select = (view: EditorView, index: number): void => {
      const item = items[index];
      const query = currentQuery(view);
      if (!item || query === null) return;
      const to = view.state.selection.from;
      const from = to - query.length - 1; // back over "/" + the typed query
      view.dispatch(view.state.tr.insertText(`/${item.name} `, from, to));
      provider.hide();
      view.focus();
    };

    const render = (view: EditorView): void => {
      const query = (currentQuery(view) ?? '').toLowerCase();
      items = commands().filter((c) => c.name.toLowerCase().includes(query));
      selected = items.length === 0 ? 0 : Math.min(selected, items.length - 1);
      menu.replaceChildren();
      for (const [i, item] of items.entries()) {
        const row = document.createElement('div');
        row.className = i === selected ? 'slash-menu-item active' : 'slash-menu-item';
        const name = document.createElement('span');
        name.className = 'slash-menu-name';
        name.textContent = `/${item.name}`;
        const desc = document.createElement('span');
        desc.className = 'slash-menu-desc';
        desc.textContent = item.description;
        row.append(name, desc);
        // mousedown (not click): fires before the editor would blur/lose the
        // selection select() needs to still be valid.
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          select(view, i);
        });
        menu.appendChild(row);
      }
      if (items.length === 0) provider.hide();
    };

    return new Plugin({
      key: slashMenuPluginKey,
      view: (editorView) => {
        let latestView = editorView;
        provider = new SlashProvider({
          content: menu,
          trigger: '/',
          // Overrides the package default (which only fires the instant a
          // bare trigger char is typed) with one that stays true for the
          // whole in-progress command, so the menu doesn't vanish after the
          // first character typed past "/".
          shouldShow: (view) => currentQuery(view) !== null,
        });
        // provider.update() debounces its actual show/hide (~200ms default),
        // so checking menu.dataset.show synchronously right after calling it
        // (as the `update` hook below still does, for keystrokes *while
        // already shown*) reads stale state on the very first trigger —
        // dataset.show hasn't flipped to 'true' yet by the time that read
        // happens. onShow fires exactly when it actually does; render() with
        // the latest view (kept current across the debounce window by
        // `update`, even though nothing else changes in that window here).
        provider.onShow = () => render(latestView);
        return {
          update: (view, prevState) => {
            latestView = view;
            provider.update(view, prevState);
            if (menu.dataset.show === 'true') render(view);
          },
          destroy: () => provider.destroy(),
        };
      },
      props: {
        handleKeyDown(view, event) {
          if (menu.dataset.show !== 'true' || items.length === 0) return false;
          switch (event.key) {
            case 'ArrowDown':
              selected = (selected + 1) % items.length;
              render(view);
              return true;
            case 'ArrowUp':
              selected = (selected - 1 + items.length) % items.length;
              render(view);
              return true;
            case 'Enter':
            case 'Tab':
              select(view, selected);
              return true;
            case 'Escape':
              provider.hide();
              return true;
            default:
              return false;
          }
        },
      },
    });
  });
