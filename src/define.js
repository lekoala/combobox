/**
 * Side-effect entry: registers <combo-box> in the standard CustomElementRegistry.
 *
 * The only file in src/ allowed to define the element. The classic distribution
 * build (dist/combobox.js) is produced from exactly this entry:
 *
 *   bun build src/define.js --outfile=dist/combobox.js --format=iife
 *
 * Importing "@lekoala/combobox" (index.js) never registers anything; a consumer
 * who wants the declarative element must opt in via any of:
 *   import "@lekoala/combobox/define";
 *   import { defineCombobox } from "@lekoala/combobox"; defineCombobox();
 *   <script src="dist/combobox.js"></script>   // classic / file://
 *
 * The name is always "combo-box". For another tag, subclass the exported
 * ComboBoxElement and register natively in application code.
 */
import { defineCombobox } from "./combo-box.js";

defineCombobox();
