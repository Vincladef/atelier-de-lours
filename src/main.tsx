import ReactDOM from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource-variable/fraunces";
import "./styles.css";
import "./app.css";
import { Provider } from "./lib/store";
import { App } from "./App";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider>
    <App />
  </Provider>,
);
