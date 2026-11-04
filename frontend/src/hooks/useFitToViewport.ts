import { useLayoutEffect, useRef } from "react";

type FitMode = "fill" | "max";

// Faz um cartao de tabela ocupar o que sobra da janela abaixo dele: o cabecalho da pagina e os filtros
// ficam no lugar e so as linhas rolam (o <th> com position: sticky gruda no topo da area de rolagem).
// "fill" fixa a altura (fila de chamados); "max" so limita (listas curtas continuam compactas).
// Em telas ate 900px (layout em cartoes) nada muda: a pagina rola normalmente.
export function useFitToViewport<T extends HTMLElement>(mode: FitMode = "fill", bottomGap = 24, minHeight = 420) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const desktop = window.matchMedia("(min-width: 901px)");
    const property = mode === "fill" ? "height" : "maxHeight";
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!desktop.matches) {
          element.style[property] = "";
          element.classList.remove("is-fit");
          return;
        }
        const top = element.getBoundingClientRect().top + window.scrollY;
        let height = Math.max(minHeight, Math.floor(window.innerHeight - top - bottomGap));
        element.style[property] = `${height}px`;
        element.classList.add("is-fit");
        // Desconta o que ainda sobrar abaixo (espacamento do conteudo) para a pagina nao rolar alguns pixels.
        const extra = document.documentElement.scrollHeight - window.innerHeight;
        if (extra > 0 && element.getBoundingClientRect().height >= height) {
          height = Math.max(minHeight, height - extra);
          element.style[property] = `${height}px`;
        }
      });
    };

    update();
    // O topo do cartao muda quando o cabecalho quebra linha, aparece um aviso ou os filtros abrem.
    const observer = new ResizeObserver(update);
    let sibling = element.previousElementSibling;
    while (sibling) { observer.observe(sibling); sibling = sibling.previousElementSibling; }
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", update);
    window.addEventListener("jh-redeflow:layout-change", update);
    desktop.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("jh-redeflow:layout-change", update);
      desktop.removeEventListener("change", update);
      element.style[property] = "";
    };
  }, [mode, bottomGap, minHeight]);

  return ref;
}
