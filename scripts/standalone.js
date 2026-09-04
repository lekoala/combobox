/** Build-only entry for the all-in-one classic distribution. */
import styles from "../src/combobox.css";
import { defineCombobox } from "../src/index.js";

const STYLE_ID = "lekoala-combobox-style";

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;

  const nonce = document.currentScript?.nonce;
  if (nonce) style.nonce = nonce;

  document.head.append(style);
}

// Bun 1.4 eliminates a nested bare import of src/define.js, even when that
// module is declared in package sideEffects. Keep registration explicit in
// this build-only entry while the source ESM entry remains side-effect free.
defineCombobox();
