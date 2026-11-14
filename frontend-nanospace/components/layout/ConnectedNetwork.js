export default function ConnectedNetwork({ className = "" }) {
  return (
    <svg
      className={`connected-network-art ${className}`}
      viewBox="0 0 500 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g className="connected-network-lines">
        <path d="M170 172 214 130 255 151 294 103 333 124 369 72 411 91 452 40 505 58" />
        <path d="M214 130 207 86 244 55 294 103 302 51 337 18 369 72 386 10 416 -8" />
        <path d="M244 55 226 12 261 -20 302 51 313 4 337 18 362 -25" />
        <path d="M294 103 333 124 350 159 385 124 411 91 431 136 462 105 505 58" />
        <path d="M333 124 337 174 385 124 398 174 431 136 464 173 488 139" />
        <path d="M207 86 168 104 170 172 226 12 185 23 207 86 244 55 261 -20" />
        <path d="M302 51 337 42 369 72 386 10 416 -8 432 30 468 4" />
      </g>
      <g className="connected-network-nodes">
        <circle cx="170" cy="172" r="2.5" />
        <circle cx="214" cy="130" r="2.5" />
        <circle cx="207" cy="86" r="2.5" />
        <circle cx="244" cy="55" r="2.5" />
        <circle cx="226" cy="12" r="2.5" />
        <circle cx="294" cy="103" r="2.5" />
        <circle cx="302" cy="51" r="2.5" />
        <circle cx="313" cy="4" r="2.5" />
        <circle cx="337" cy="18" r="2.5" />
        <circle cx="333" cy="124" r="2.5" />
        <circle cx="369" cy="72" r="2.5" />
        <circle cx="386" cy="10" r="2.5" />
        <circle cx="411" cy="91" r="2.5" />
        <circle cx="416" cy="-8" r="2.5" />
        <circle cx="431" cy="136" r="2.5" />
        <circle cx="452" cy="40" r="2.5" />
        <circle cx="464" cy="173" r="2.5" />
      </g>
    </svg>
  );
}
