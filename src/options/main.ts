import { mount } from "svelte";
import Options from "./Options.svelte";
import "../popup/popup.css";
import "./options.css";

export default mount(Options, { target: document.getElementById("app")! });
