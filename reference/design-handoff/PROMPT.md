# Prompt for Claude Code

Copy everything below the line into Claude Code as your first message (fill in
the bracketed parts).

---

I'm handing you a design system for my social carousel pipeline. The design
handoff bundle is at `[path/to/design_handoff_carousel_pipeline/]` in this
repo — read `README.md` fully and open `Carousel Directions.dc.html` to see
the actual designs before writing any code.

Context: my pipeline programmatically generates carousel slides for RM
Psyllium (B2B psyllium supplier) as HTML rendered to PNG
(`[describe: e.g. Node + Puppeteer, templates in src/templates/, content
comes from JSON produced by an LLM step]`). The current templates produce
the generic-looking slides; this handoff replaces them with a branded system:
3 cover treatments (2a green / 2b terracotta / 2c cream-signature), 3
interior themes (1a Mill Paper / 1b Spec Sheet / 1c Grove), and
profile-grid color-rotation rules.

How I want you to work:

1. **Take in context first.** Explore my pipeline end to end — template
   layer, content schema, render/capture step, font loading, output sizes,
   how slide types are chosen — before proposing anything. Understand what
   the LLM content step outputs and what the templates consume.
2. **Ask questions before building.** Ask me everything that materially
   affects the implementation — which interior theme(s) to build first,
   whether themes are per-post config or per-campaign, how cover rotation
   state should persist (so the profile grid pattern holds across posts),
   which platforms/sizes to ship (1080×1080, 1080×1920, CJK variants), how
   photos get injected, whether slide copy lengths are bounded. Don't assume.
3. **Think deeply, not surface level.** I don't want a reskin that copies
   hex codes onto the old templates. Think through: a proper token layer
   (colors/type/spacing per theme) so themes are data, not forked templates;
   a slide-type schema (cover, question, payoff, CTA, photo) with slots the
   content step fills; text-overflow strategy at fixed slide sizes (clamping,
   auto-fit, or content-length contracts with the LLM step); deterministic
   font loading before capture (`document.fonts.ready` + bundled/woff2
   fonts, including Noto Sans SC for Chinese variants); why the emblem
   watermark must be tinted SVG `<img>` files and never CSS masks (my
   HTML→PNG capture doesn't rasterize masks reliably); and how the grid
   rotation rule is enforced across posts, not per post.
4. **Respect the non-negotiables in the README**: only the supplied emblem
   SVGs as the mark, watermarks stay ≤0.15 opacity and never cross text,
   interiors always cream, one cover color per post chosen by the rotation
   rule, minimum 28px body text at 1080.
5. Propose your implementation plan (schema, file structure, migration of my
   existing templates) and get my sign-off before writing the bulk of the
   code. Then implement, and include a preview harness that renders every
   slide type × every theme × every cover so I can eyeball the whole matrix
   at once.
