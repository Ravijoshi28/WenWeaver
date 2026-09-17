# WebWeaver design notes

## Reference and scope

Reference: [Leonxlnx/taste-skill, design-taste-frontend](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md).

Design read: a developer workspace for people building projects and recruiters reviewing the implementation. The landing page uses a restrained, asymmetric composition. Dial values: design variance 6, motion intensity 3, visual density 4.

The source skill excludes dense product interfaces and code editors. Its marketing guidance is applied to the landing page. Product screens use the existing Base UI primitives and semantic CSS tokens, while Monaco uses its official `vs` and `vs-dark` themes.

## Starting-point audit

The original interface used a fixed dark palette, blue/violet gradients, repeated centered sections, duplicate workspace toolbars, very small labels, and an always-visible file explorer beside two narrow panels. Account screens and dialogs did not share consistent theme behavior.

Retained: the WebWeaver name, existing route slugs, account field order, project operations, Monaco/Yjs bindings, and storage/preview API contracts. Existing logo assets remain in the repository. No analytics integration or legal copy was changed.

## Final system

- Geist and Geist Mono, with green as the primary accent and one neutral family.
- Semantic light and dark tokens, respecting system preference and a manual theme toggle.
- Controls use an 8px radius; general panels use 16px; compact editor panels use 12px.
- Hover and pressed feedback only; Monaco smooth cursor/scroll behavior respects reduced motion.
- The header is the navigation layer; dialogs use the existing Base UI layer at 50, and the focused skip link uses 60.
- At 900px and below, the coding workspace displays one content panel at a time. Files is a collapsible region, and selecting a file closes it on compact screens. Code and preview remain mounted while switching views.
- Preview sizing uses the available panel width or a maximum 390px viewport. It does not create a second sandbox.
- File/folder creation stays local until Save. Empty, loading, error, connection, and last-save states use explicit text.

## Assets

`public/images/collaboration-weave.png` was generated with the built-in image-generation tool. It is an editorial illustration, not a screenshot of product functionality.

Final generation prompt:

> Create a polished 3D editorial illustration for WebWeaver, a collaborative coding website. Asset only, no UI, no typography, no letters, no logos or watermark. Square composition: several continuous broad flat ribbons in deep forest green and brushed pale silver weave through one another into an open architectural knot, an elegant physical metaphor for independent code coming together. Sculptural, precise, tactile matte surfaces, subtle imperfections, soft daylight studio lighting and realistic ambient shadows. Centered object fills about 75% of image, pale cool gray seamless background (#eef1ef), orthographic three-quarter camera, generous uncluttered margins. Restrained premium technical aesthetic, no neon, no purple, no glow, no circuitry, no gradients as decoration. Output a high-quality square image suitable for cropping into a landing hero and auth sidebar. Save asset for use in a local website project.

The existing `public/collab.gif` is retained as a supporting illustration. Screenshots in `docs/images` were captured from the running application. Editor screenshots use explicit sample files and mocked API/preview responses, with collaboration traffic blocked; they do not depict a real account, production project, or active cloud sandbox.

## Validation boundary

The production build, TypeScript, and focused UI lint checks pass. Full-source lint retains two existing explicit-any errors outside the redesigned UI. Public-page browser checks covered light/dark desktop and mobile layouts. Editor fixture checks covered native Monaco rendering, explorer file selection/search, layout switching, and preview sizing without accessing user projects.

A Lighthouse accessibility report for the local landing page scored 100/100; Windows denied the temporary browser-profile cleanup afterward. Production performance and live service integration are outside those checks.
