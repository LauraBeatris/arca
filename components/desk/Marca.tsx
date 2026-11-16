/**
 * The mark: Pessoa's arca, the trunk his papers were found in, seen from the
 * front with its lid thrown back and three loose sheets standing out of it.
 *
 * Drawn back to front: lid, sheets, body. The sheets are clipped at the
 * body's rim, so they only show once they rise out of it (even before the
 * body's fill has faded in).
 *
 * Purely decorative (the title beside it is the real heading). All motion is
 * CSS in desk.css, so it plays on first paint without waiting for JS.
 */
export function Marca() {
  return (
    <svg
      className="marca"
      viewBox="0 0 40 38"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="marca-dentro">
          <rect x="0" y="-10" width="40" height="31.5" />
        </clipPath>
      </defs>

      <g className="marca-tampa">
        <path
          className="marca-traco"
          pathLength={1}
          d="M4 21V17.5C4 13.6 10 12 20 12S36 13.6 36 17.5V21Z"
        />
        <path className="marca-detalhe" d="M4.4 18.4H35.6" />
      </g>

      <g clipPath="url(#marca-dentro)">
        <g className="marca-folha marca-folha-1">
          <rect x="11" y="9" width="11" height="15" rx="0.6" />
        </g>
        <g className="marca-folha marca-folha-2">
          <rect x="18" y="8" width="11" height="15" rx="0.6" />
        </g>
        <g className="marca-folha marca-folha-3">
          <rect x="14.5" y="6.5" width="11" height="15" rx="0.6" />
          <path className="marca-linhas" d="M17 10.5h6M17 13h4.5M17 15.5h5.5" />
          <path className="marca-fita" d="M22.6 4.6v5.8" />
        </g>
      </g>

      <g className="marca-corpo">
        <rect
          className="marca-traco"
          pathLength={1}
          x="4"
          y="21"
          width="32"
          height="14.5"
          rx="1.2"
        />
        <path className="marca-detalhe" d="M10.5 21v14.5M29.5 21v14.5" />
        <path className="marca-fecho" d="M18 21v2.6a2 2 0 0 0 4 0V21" />
      </g>
    </svg>
  );
}
