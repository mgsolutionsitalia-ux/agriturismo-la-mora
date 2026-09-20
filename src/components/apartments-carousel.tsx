"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { APARTMENTS, type Apartment } from "@/data/apartments";
import { ZodiacMark } from "@/components/zodiac-mark";

const N = APARTMENTS.length;
const MAX_POS = N - 1;

/* Altezza totale della sezione pinned: 5 appartamenti, ~85vh di scorrimento
   percepito ciascuno (100vh di viewport fissa + il resto come distanza di
   scroll dedicata al percorso). Calibrato in browser (criterio: nessun
   apartment "scatta" troppo in fretta, nessuno resta troppo a lungo). */
const OUTER_VH = 460;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

/* Distanza circolare con segno più breve da `active` a `i`. */
function circularOffset(i: number, active: number, n: number) {
  let diff = mod(i - active, n);
  if (diff > n / 2) diff -= n;
  return diff;
}

/* Come circularOffset, ma per una posizione continua (non intera): usata
   dal carousel pinned desktop per avere SEMPRE 2 vicine oblique per lato,
   fin dal primo frame in cui la sezione entra in viewport — non solo dopo
   che l'utente ha scrollato a metà percorso. */
function circularOffsetContinuous(i: number, pos: number, n: number) {
  let diff = mod(i - pos, n);
  if (diff > n / 2) diff -= n;
  return diff;
}

/* Indice (in APARTMENTS) mostrato al centro appena la sezione si aggancia
   allo scroll, prima ancora che l'utente muova la rotella: Pesci, la
   "mediana" dei 5 — così sopra/sotto quel punto restano sempre 2 vicine per
   lato invece di partire con un lato vuoto. */
const START_INDEX = APARTMENTS.findIndex((a) => a.slug === "pesci");

/* Curva di "dwell": ogni cella intera [i, i+1] resta piatta (nessun
   movimento) nel primo/ultimo 18% e si muove solo nel tratto centrale —
   così ogni appartamento ha un momento di stabilità al centro invece di
   attraversarlo senza sosta durante lo scroll. */
const HOLD_IN = 0.18;
const HOLD_OUT = 0.82;

function dwellWarp(raw: number, maxPos: number) {
  if (maxPos <= 0) return 0;
  const scaled = clamp(raw, 0, 1) * maxPos;
  if (scaled >= maxPos) return maxPos;
  const i = clamp(Math.floor(scaled), 0, maxPos - 1);
  const t = scaled - i;
  let eased: number;
  if (t <= HOLD_IN) eased = 0;
  else if (t >= HOLD_OUT) eased = 1;
  else {
    const local = (t - HOLD_IN) / (HOLD_OUT - HOLD_IN);
    eased = local * local * (3 - 2 * local); // smoothstep
  }
  return i + eased;
}

/* Spring critically-damped scritta a mano (nessuna dipendenza Framer
   Motion nel progetto): stiffness/damping/mass nel range consigliato,
   integrazione semi-implicita via requestAnimationFrame, suddivisa in
   sotto-passi a passo fisso (vedi SPRING_SUBSTEP sotto): con questi valori
   di stiffness/damping l'integrazione a passo singolo diverge (autovalore
   dello schema discreto >1 in modulo) non appena il frame-time si avvicina
   al cap di 50ms — cioè in qualunque calo di framerate reale sotto ~60fps,
   producendo posizioni impazzite e card invisibili. I sotto-passi a 1/120s
   restano nella regione stabile qualunque sia il framerate reale. */
const SPRING_STIFFNESS = 130;
const SPRING_DAMPING = 26;
const SPRING_MASS = 0.55;
const SPRING_SUBSTEP = 1 / 120;
/* Gap di frame-time oltre il quale non ha senso integrare (tab tornato in
   primo piano dopo minuti, DevTools che ha messo in pausa il JS, ecc.):
   si salta direttamente al target invece di eseguire centinaia di
   sotto-passi per recuperare un salto che l'utente non ha comunque visto. */
const SPRING_MAX_DT = 0.25;

/* --- Geometria dei 5 slot (desktop/tablet) -------------------------------
   Keyframe a rel 0/1/2/3 (rel = indice card − posizione corrente),
   interpolati linearmente per un movimento continuo guidato dallo scroll
   (mai un salto discreto tra stati). Il gap cumulativo tra slot garantisce
   che due card adiacenti non si sovrappongano mai, anche ruotate. */
const GAP_1 = 55;
const GAP_2 = 65; // cumulativo 120px a rel 2, come da riferimento
const GAP_3 = 70; // slot "fantasma" oltre cui la card è già invisibile

/* Attenuazione MOLTO leggera di luminosità/saturazione sulle card laterali
   (richiesta esplicita: "leggermente meno luminose e meno sature; comunque
   nitide, mai sfocate"). Una review precedente aveva segnalato foto
   "sfocate/sporche" e il fix di allora fu rimuovere il filtro del tutto —
   qui si reintroduce ma con valori minimi (0.94/0.90 a rel 1, mai sotto
   0.85) proprio per restare "leggermente" attenuate e non "sporche": la
   nitidezza non dipende dal filtro (nessun blur è mai stato applicato),
   dipende dalla risoluzione reale delle foto sorgente. */
const SLOT_KEYFRAMES = [
  { rel: 0, gap: 0, rotate: 0, scale: 1, opacity: 1, brightness: 1, saturate: 1 },
  { rel: 1, gap: GAP_1, rotate: 8, scale: 0.96, opacity: 1, brightness: 0.94, saturate: 0.9 },
  { rel: 2, gap: GAP_1 + GAP_2, rotate: 16, scale: 0.91, opacity: 1, brightness: 0.88, saturate: 0.82 },
  { rel: 3, gap: GAP_1 + GAP_2 + GAP_3, rotate: 20, scale: 0.87, opacity: 0, brightness: 0.85, saturate: 0.78 },
];

type CardTransform = {
  x: number;
  rotate: number;
  scale: number;
  opacity: number;
  brightness: number;
  saturate: number;
};

function slotTransform(rel: number, cardWidth: number): CardTransform {
  const sign = rel < 0 ? -1 : 1;
  const abs = Math.min(Math.abs(rel), 3);
  const i = Math.min(Math.floor(abs), 2);
  const t = abs - i;
  const a = SLOT_KEYFRAMES[i];
  const b = SLOT_KEYFRAMES[i + 1];
  const xA = a.rel * cardWidth + a.gap;
  const xB = b.rel * cardWidth + b.gap;
  return {
    x: sign * lerp(xA, xB, t),
    rotate: sign * lerp(a.rotate, b.rotate, t),
    scale: lerp(a.scale, b.scale, t),
    opacity: lerp(a.opacity, b.opacity, t),
    brightness: lerp(a.brightness, b.brightness, t),
    saturate: lerp(a.saturate, b.saturate, t),
  };
}

/* Deve combaciare ESATTAMENTE con il margin-top reale del contenitore delle
   card (sm:mt-10 = 40px, sempre attivo perché questo componente esiste solo
   da 768px in su). Prima valeva solo 20px "a stima": la card veniva quindi
   dimensionata più alta di quanto la regione avesse davvero libero, e
   l'eccesso finiva per mangiarsi visivamente il gap dal titolo (bug
   segnalato più volte). Se il margin-top del contenitore card cambia,
   aggiornare anche questa costante — altrimenti si ripresenta lo stesso bug. */
const VERTICAL_BREATHING_ROOM = 40;

/* clamp(360px, 34vw, 580px) replicato in JS per calcolare gli offset in
   px degli slot senza dover misurare il DOM ad ogni frame. La larghezza
   finale è la più piccola tra il vincolo di larghezza (34vw) e quello
   d'altezza (spazio verticale REALMENTE disponibile — 100vh meno le
   altezze vere di titolo e CTA, misurate nel DOM — per l'aspect 4:5):
   su schermi bassi vince il secondo, garantendo zero overlap by
   construction invece di sperare che ci sia sempre spazio a sufficienza. */
function cardWidthForViewport(vw: number, vh: number, headingH: number, ctaH: number) {
  const widthBound = clamp(vw * 0.37, 380, 620);
  const availableHeight = vh - headingH - ctaH - VERTICAL_BREATHING_ROOM;
  // Il moltiplicatore (0.72, non 1/1.25=0.8) non è solo l'aspect 4:5: una
  // card RUOTATA (fino a 16° per le laterali visibili) ha un bounding box
  // verticale più alto della sua altezza nominale — a card grandi quel
  // margine extra basta a far toccare card oblique con titolo/CTA (bug
  // reale osservato: gap negativo). Il fattore in più è il margine di
  // sicurezza per quella crescita da rotazione.
  const heightBound = clamp(availableHeight, 340, 720) * 0.72;
  return Math.min(widthBound, heightBound);
}

type Tier = "desktop" | "mobile";

function tierFromWidth(w: number): Tier {
  return w < 768 ? "mobile" : "desktop";
}

function useViewportTier(): Tier {
  const [tier, setTier] = useState<Tier>("desktop");
  useEffect(() => {
    function update() {
      setTier(tierFromWidth(window.innerWidth));
    }
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);
  return tier;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* Decorazioni line-art: costellazioni astratte, texture quasi impercettibile
   (opacity 0.04–0.08), con un parallax verticale lentissimo (pochi px) letto
   direttamente dallo scroll — nessun re-render React, scrittura diretta sul
   DOM per restare fluido, disattivato con prefers-reduced-motion. */
function ConstellationField({ reducedMotion }: { reducedMotion: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (reducedMotion) return;
    let ticking = false;

    function paint() {
      const wrap = wrapRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const center = rect.top + rect.height / 2 - window.innerHeight / 2;
        layerRefs.current.forEach((el, i) => {
          if (!el) return;
          const speed = (i + 1) * 4;
          const shift = Math.max(-speed, Math.min(speed, -center / 60));
          el.style.transform = `translateY(${shift.toFixed(2)}px)`;
        });
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(paint);
        ticking = true;
      }
    }

    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reducedMotion]);

  const dots = [
    { points: "120,90 165,60 210,110 260,70" },
    { points: "900,140 950,190 1005,150 1050,205" },
    { points: "300,520 340,470 390,500" },
    { points: "1120,460 1160,510 1100,540 1150,570" },
  ];

  return (
    <div ref={wrapRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d, i) => (
        <div
          key={i}
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
          className="absolute inset-0"
        >
          <svg viewBox="0 0 1200 640" className="absolute inset-0 h-full w-full text-olive-950" style={{ opacity: 0.06 }}>
            <polyline points={d.points} fill="none" stroke="currentColor" strokeWidth="1" />
            {d.points.split(" ").map((p, pi) => {
              const [x, y] = p.split(",");
              return <circle key={pi} cx={x} cy={y} r="2.2" fill="currentColor" />;
            })}
          </svg>
        </div>
      ))}
    </div>
  );
}

/* Iconcine dei dettagli rapidi (ospiti/letti/bagni/mq): line-art minimale,
   stroke 1.5, stesso linguaggio delle altre icone del sito (PhoneIcon,
   WhatsAppIcon...). Colore ereditato (currentColor) così seguono il cream
   con drop-shadow del testo accanto, restando leggibili su qualunque foto. */
function GuestsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* Letto a castello, non un letto singolo generico: quasi tutti gli
   appartamenti ne hanno uno reale (unico dato verificato per la
   configurazione letti), un'icona più specifica comunica meglio la
   dotazione reale rispetto a un letto anonimo. */
function BedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M3 3.5h11a2 2 0 0 1 2 2V8H3V3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="6" cy="5.6" r="0.9" fill="currentColor" />
      <path d="M3 8h15a2 2 0 0 1 2 2v2H3v-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="6" cy="10" r="0.9" fill="currentColor" />
      <path d="M3 12v6.5M20 12v6.5M3 18.5h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* Badge testuale "pet friendly": sempre visibile (non lega al hover come
   la riga statistiche), ancorato in alto a destra sulla card intera così
   ruota/scala insieme ad essa senza calcoli aggiuntivi. */
function PetBadge() {
  return (
    <span className="absolute right-3 top-3 z-10 rounded-full bg-cream px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-olive-950 shadow-[0_6px_16px_rgba(0,0,0,0.3)]">
      Pet friendly
    </span>
  );
}

function ShowerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M6 9V6.5A3.5 3.5 0 0 1 9.5 3h1A3.5 3.5 0 0 1 14 6.5V9M4 9h16M8 13v.01M12 13v.01M16 13v.01M8 17v.01M12 17v.01M16 17v.01"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FloorplanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3.5V13M12 13H20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* Riga di dettagli sempre visibile (non solo in hover): l'obiettivo esplicito
   è che l'utente capisca capienza/letti/bagni/mq direttamente dalla card,
   senza dover aprire la scheda dell'appartamento. Numeri nudi accanto alle
   icone (non "4 ospiti", "4 letti"...): più compatti su card che arrivano a
   scalare fino a ~0.87×, restano comunque leggibili grazie all'icona che
   dà il contesto — l'etichetta completa resta disponibile via aria-label. */
function StatsRow({ apt }: { apt: Apartment }) {
  const items = [
    { Icon: GuestsIcon, value: String(apt.maxGuests), label: `${apt.maxGuests} ospiti` },
    { Icon: BedIcon, value: String(apt.beds), label: `${apt.beds} letti` },
    { Icon: ShowerIcon, value: String(apt.bathrooms), label: `${apt.bathrooms} bagno${apt.bathrooms > 1 ? "i" : ""}` },
    { Icon: FloorplanIcon, value: `${apt.sqm} m²`, label: `${apt.sqm} metri quadrati` },
  ];
  return (
    <div className="mt-3 flex items-center justify-center gap-3 rounded-full bg-ink/35 px-3.5 py-1.5 text-cream backdrop-blur-[2px]">
      {items.map(({ Icon, value, label }, i) => (
        <span key={i} aria-label={label} className="flex items-center gap-1">
          <Icon />
          <span aria-hidden="true" className="text-[11px] font-medium tabular-nums">
            {value}
          </span>
        </span>
      ))}
    </div>
  );
}

function CardFace({
  apt,
  showPanel,
  sizes,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  apt: Apartment;
  showPanel: boolean;
  sizes: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}) {
  return (
    <div
      className="group relative aspect-[4/5] overflow-hidden bg-ink/5 shadow-[0_25px_55px_-25px_rgba(28,33,23,0.4)]"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <Image src={apt.image} alt={apt.alt} fill quality={92} sizes={sizes} className="object-cover" />

      {apt.petFriendly && <PetBadge />}

      {/* Scrim di leggibilità per nome + riga statistiche: indipendente dal
          filtro brightness/saturate già applicato all'intero elemento (che
          serve solo alla profondità tra card centrale/laterali), garantisce
          contrasto sufficiente qualunque sia la foto sottostante. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%]"
        style={{ background: "linear-gradient(0deg, rgba(10,10,8,.62) 0%, rgba(10,10,8,0) 100%)" }}
      />

      {/* Niente dimming aggiuntivo qui legato a "è la card centrale?": la
          differenza di profondità la dà già il filtro brightness/saturate
          scritto direttamente sull'elemento (vedi applyPositions), che
          resta sempre in sync con la posizione reale della card anche
          quando lo scroll cambia molto rapidamente. Si dissolve (non si
          smonta) quando il pannello hover appare, per non dover far
          combaciare a pixel le due altezze. */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-5 transition-opacity duration-300 ease-out"
        style={{ opacity: showPanel ? 0 : 1 }}
      >
        <span className="mb-2 text-cream drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
          <ZodiacMark sign={apt.zodiac} className="h-8 w-8" />
        </span>
        <span className="font-display text-[30px] text-cream drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
          {apt.name}
        </span>
        <StatsRow apt={apt} />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 bg-[#f1f1f1] px-5 pb-5 pt-4 transition-[opacity,transform] duration-300 ease-out"
        style={{
          opacity: showPanel ? 1 : 0,
          transform: showPanel ? "translateY(0)" : "translateY(15px)",
          pointerEvents: showPanel ? "auto" : "none",
        }}
      >
        <span className="block text-center font-display text-2xl text-ink">{apt.name}</span>
        {/* Colonna, non riga: su card strette (viewport bassi, dove la card
            si restringe per non sovrapporsi a titolo/CTA) le due call to
            action non entravano più affiancate e ciascuna andava a capo a
            metà frase ("PRENOTA" / "ORA"). In colonna ogni frase ha sempre
            tutta la larghezza della card per sé, mai spezzata. */}
        <div className="mt-3 flex flex-col items-center gap-2.5">
          {/* Apre il widget camere di bed-and-breakfast.it (vedi layout.tsx):
              le pagine di dettaglio per singolo appartamento sono fuori
              scope in questa fase, quindi qui la prenotazione reale passa
              dal widget invece che da un link a una pagina non ancora
              costruita. */}
          <button
            type="button"
            className="rrp-widget-open-modal whitespace-nowrap rounded-[2px] border border-raspberry px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-raspberry transition-colors duration-200 hover:bg-raspberry hover:text-cream"
          >
            Prenota ora
          </button>
          <Link
            href={apt.href}
            className="group/link whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-soft underline decoration-ink-soft/40 underline-offset-4 transition-colors hover:text-raspberry"
          >
            Scopri di più
          </Link>
        </div>
      </div>
    </div>
  );
}

function SectionHeading() {
  return (
    <div className="relative z-[2] mx-auto flex max-w-[720px] flex-col items-center px-6 pt-6 text-center sm:pt-8">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-olive-950">Gli appartamenti</span>
      <h2 className="mt-5 font-display text-[clamp(32px,3vw,54px)] font-normal leading-[1.05] text-ink">
        Cinque appartamenti, cinque costellazioni
      </h2>
    </div>
  );
}

/* --- Desktop / tablet: pinned scroll-driven carousel --------------------
   La sezione outer occupa OUTER_VH di altezza; il contenuto visibile resta
   sticky mentre lo scroll-progress dell'utente avanza un valore continuo
   `position` 0..N-1 tra i 5 slot. Nessun preventDefault: lo scroll nativo
   della pagina resta intatto, guida solo il progress. */
function DesktopCarousel({ reducedMotion }: { reducedMotion: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ctaRef = useRef<HTMLDivElement>(null);
  const targetPos = useRef(START_INDEX);
  const smoothPos = useRef(START_INDEX);
  const velocity = useRef(0);
  const cardWidthRef = useRef(360);
  const runningRef = useRef(true);
  const [revealed, setRevealed] = useState<number | null>(null);
  const revealedRef = useRef<number | null>(null);

  const reveal = useCallback((index: number | null) => {
    revealedRef.current = index;
    setRevealed(index);
  }, []);

  /* "Chi è la card centrale" vive SOLO nel DOM (dataset), mai in uno state
     React aggiornato dal loop rAF: uno state impostato da requestAnimationFrame
     può restare bloccato su un valore vecchio quando il thread è sotto
     pressione (tab in background, tantissimi tick ravvicinati) mentre le
     posizioni — scritte qui in modo imperativo — restano sempre corrette.
     Leggere cardRefs.current[i].dataset.center al momento dell'hover/click
     garantisce che l'interazione usi sempre lo stato visivo reale, mai una
     copia potenzialmente disallineata. */
  const applyPositions = useCallback((pos: number) => {
    const cw = cardWidthRef.current;
    const nearest = mod(Math.round(pos), N);
    for (let i = 0; i < N; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const rel = circularOffsetContinuous(i, pos, N);
      const t = slotTransform(rel, cw);
      el.style.width = `${cw.toFixed(1)}px`;
      el.style.transform = `translate3d(calc(-50% + ${t.x.toFixed(2)}px), -50%, 0) rotate(${t.rotate.toFixed(2)}deg) scale(${t.scale.toFixed(3)})`;
      el.style.opacity = t.opacity.toFixed(3);
      el.style.filter = `brightness(${t.brightness.toFixed(3)}) saturate(${t.saturate.toFixed(3)})`;
      el.style.zIndex = String(Math.round(100 - Math.abs(rel) * 10));
      el.style.pointerEvents = t.opacity < 0.05 ? "none" : "auto";
      el.dataset.center = i === nearest ? "1" : "0";
    }
    if (revealedRef.current !== null && revealedRef.current !== nearest) {
      revealedRef.current = null;
      setRevealed(null);
    }
  }, []);

  useEffect(() => {
    function updateWidth() {
      // Altezze REALI di titolo e CTA lette dal DOM (non stimate): la card
      // può così crescere fino a occupare esattamente lo spazio verticale
      // che avanza, invece di restare piccola per una stima prudenziale.
      const headingEl = outerRef.current?.querySelector("h2")?.parentElement;
      const headingH = headingEl?.getBoundingClientRect().height ?? 0;
      const ctaH = ctaRef.current?.getBoundingClientRect().height ?? 0;
      cardWidthRef.current = cardWidthForViewport(window.innerWidth, window.innerHeight, headingH, ctaH);
    }
    updateWidth();
    window.addEventListener("resize", updateWidth, { passive: true });
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    function computeTarget() {
      const outer = outerRef.current;
      if (!outer) return;
      const rect = outer.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const raw = total <= 0 ? 0 : clamp(-rect.top / total, 0, 1);
      // Parte da Pesci (START_INDEX), non da 0: così anche al primissimo
      // frame in cui la sezione si aggancia (raw≈0) ci sono già 2 vicine
      // oblique per lato, invece di un lato vuoto finché non si scrolla.
      targetPos.current = START_INDEX + dwellWarp(raw, MAX_POS);

      if (ctaRef.current) {
        const opacity = raw < 0.84 ? 0 : raw > 0.95 ? 1 : (raw - 0.84) / 0.11;
        ctaRef.current.style.opacity = opacity.toFixed(3);
        ctaRef.current.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
      }
    }
    computeTarget();
    window.addEventListener("scroll", computeTarget, { passive: true });
    window.addEventListener("resize", computeTarget, { passive: true });
    return () => {
      window.removeEventListener("scroll", computeTarget);
      window.removeEventListener("resize", computeTarget);
    };
  }, []);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        runningRef.current = entry.isIntersecting;
      },
      { rootMargin: "20% 0px 20% 0px" }
    );
    io.observe(outer);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, SPRING_MAX_DT);
      last = now;

      if (reducedMotion) {
        smoothPos.current = targetPos.current;
        velocity.current = 0;
      } else if (runningRef.current) {
        if (dt >= SPRING_MAX_DT) {
          // Gap anomalo (tab in background, DevTools in pausa): niente
          // integrazione a sotto-passi per un recupero mai visto, si salta
          // direttamente al target.
          smoothPos.current = targetPos.current;
          velocity.current = 0;
        } else {
          let remaining = dt;
          while (remaining > 0) {
            const step = Math.min(SPRING_SUBSTEP, remaining);
            const target = targetPos.current;
            const force = -SPRING_STIFFNESS * (smoothPos.current - target);
            const damp = -SPRING_DAMPING * velocity.current;
            velocity.current += ((force + damp) / SPRING_MASS) * step;
            smoothPos.current += velocity.current * step;
            remaining -= step;
          }
          if (
            Math.abs(smoothPos.current - targetPos.current) < 0.001 &&
            Math.abs(velocity.current) < 0.001
          ) {
            smoothPos.current = targetPos.current;
            velocity.current = 0;
          }
        }
      }

      applyPositions(smoothPos.current);

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyPositions, reducedMotion]);

  const goTo = useCallback((index: number) => {
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    if (total <= 0) return;
    // Inversa di "START_INDEX + dwellWarp(raw, MAX_POS)": quanti passi dalla
    // partenza (Pesci) servono per arrivare a `index`, in ordine circolare.
    const steps = mod(index - START_INDEX, N);
    const raw = clamp(steps / MAX_POS, 0, 1);
    const y = window.scrollY + rect.top + raw * total;
    window.scrollTo({ top: y, behavior: "smooth" });
  }, []);

  return (
    <div ref={outerRef} className="relative" style={{ height: `${OUTER_VH}vh` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden">
        <ConstellationField reducedMotion={reducedMotion} />
        <SectionHeading />

        <div
          role="region"
          aria-roledescription="carousel"
          aria-label="Appartamenti di Agriturismo La Mora"
          className="relative z-[2] mt-8 min-h-0 flex-1 sm:mt-10"
        >
          {APARTMENTS.map((apt, i) => {
            const showPanel = revealed === i;
            return (
              <div
                key={apt.slug}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="absolute left-1/2 top-1/2 will-change-transform"
                style={{ width: "clamp(360px, 34vw, 580px)" }}
              >
                <CardFace
                  apt={apt}
                  showPanel={showPanel}
                  sizes="(max-width: 1200px) 50vw, 580px"
                  onMouseEnter={() => {
                    if (cardRefs.current[i]?.dataset.center === "1") reveal(i);
                  }}
                  onMouseLeave={() => reveal(null)}
                  onClick={() => {
                    if (cardRefs.current[i]?.dataset.center !== "1") goTo(i);
                  }}
                />
              </div>
            );
          })}
        </div>

        <div ref={ctaRef} className="relative z-[2] flex justify-center pb-16 pt-8 sm:pb-20 sm:pt-10" style={{ opacity: 0, pointerEvents: "none" }}>
          <Link
            href="/alloggi/"
            className="group inline-flex items-center gap-2.5 rounded-[3px] bg-raspberry px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-cream transition-colors duration-200 hover:bg-[#8a3844]"
          >
            Tutti gli appartamenti
            <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* --- Mobile: nessun pinned scroll --------------------------------------
   Su schermi piccoli lo scroll verticale della pagina resta normale e
   progressivo (item 27 del brief): la sezione è un blocco in-flow di
   altezza contenuta, il cambio appartamento avviene solo via swipe /
   tastiera, mai intercettando lo scroll verticale della pagina. */
const MOBILE_LOCK_MS = 480;
const SWIPE_THRESHOLD = 46;
const MOBILE_ROTATE = 3;
const MOBILE_GAP = 20;

function mobileCardWidth(vw: number) {
  return clamp(vw * 0.8, 260, 360);
}

function MobileCarousel({ reducedMotion }: { reducedMotion: boolean }) {
  const [active, setActive] = useState(START_INDEX);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [cardWidth, setCardWidth] = useState(320);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    function update() {
      setCardWidth(mobileCardWidth(window.innerWidth));
    }
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => () => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    setActive((cur) => mod(cur + dir, N));
    setLocked(true);
    setRevealed(null);
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => setLocked(false), MOBILE_LOCK_MS);
  }, []);

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    dragStartX.current = e.clientX;
  }, []);

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (dragStartX.current === null || locked) return;
      const delta = e.clientX - dragStartX.current;
      dragStartX.current = null;
      if (Math.abs(delta) >= SWIPE_THRESHOLD) {
        step(delta < 0 ? 1 : -1);
      }
    },
    [locked, step]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    },
    [step]
  );

  return (
    <div className="relative overflow-hidden pb-16 pt-4">
      <ConstellationField reducedMotion={reducedMotion} />
      <SectionHeading />

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Appartamenti di Agriturismo La Mora"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="relative z-[2] mt-10 h-[440px] w-full touch-pan-y select-none outline-none"
      >
        {APARTMENTS.map((apt, i) => {
          const offset = circularOffset(i, active, N);
          const abs = Math.abs(offset);
          const hidden = abs > 1;
          const isCenter = offset === 0;
          const showPanel = isCenter && revealed === i;
          const translateX = offset * (cardWidth + MOBILE_GAP);
          const rotate = reducedMotion ? 0 : offset === 0 ? 0 : MOBILE_ROTATE * Math.sign(offset);
          const scale = abs === 0 ? 1 : 0.94;
          const opacity = hidden ? 0 : abs === 0 ? 1 : 0.9;

          return (
            <div
              key={apt.slug}
              className="absolute left-1/2 top-1/2"
              style={{
                width: `${cardWidth}px`,
                transform: `translate(-50%, -50%) translateX(${translateX}px) rotate(${rotate}deg) scale(${scale})`,
                opacity,
                zIndex: 10 - abs,
                pointerEvents: hidden ? "none" : undefined,
                transition:
                  reducedMotion
                    ? "opacity 320ms ease"
                    : "transform 480ms cubic-bezier(.22,1,.36,1), opacity 480ms cubic-bezier(.22,1,.36,1)",
              }}
            >
              <CardFace
                apt={apt}
                showPanel={showPanel}
                sizes="82vw"
                onMouseEnter={() => isCenter && setRevealed(i)}
                onClick={() => {
                  if (!isCenter) {
                    if (!locked) setActive(i);
                  } else {
                    setRevealed((r) => (r === i ? null : i));
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="relative z-[2] mt-12 flex justify-center">
        <Link
          href="/alloggi/"
          className="group inline-flex items-center gap-2.5 rounded-[3px] bg-raspberry px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-cream transition-colors duration-200 hover:bg-[#8a3844]"
        >
          Tutti gli appartamenti
          <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}

/* prefers-reduced-motion: niente pinning/scroll-jacking, per quanto
   attenuato dallo spring. La guida ux (ricerca "sticky pinned horizontal
   scroll carousel") è esplicita: "Honor prefers-reduced-motion and present
   the final readable state without parallax or scroll-jacking" — quindi
   qui non basta rallentare l'animazione, la sezione non deve trattenere lo
   scroll: tutti e 5 gli appartamenti sono sempre visibili, in linea, senza
   dipendenza dalla posizione di scroll. */
function StaticGrid() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative overflow-hidden pb-16 pt-4 sm:pb-20">
      <SectionHeading />
      <div className="relative z-[2] mt-10 flex flex-wrap items-start justify-center gap-6 px-6 sm:mt-12">
        {APARTMENTS.map((apt) => (
          <div key={apt.slug} style={{ width: "min(300px, 42vw)" }}>
            <CardFace
              apt={apt}
              showPanel={hovered === apt.slug}
              sizes="(max-width: 640px) 42vw, 300px"
              onMouseEnter={() => setHovered(apt.slug)}
              onMouseLeave={() => setHovered(null)}
            />
          </div>
        ))}
      </div>
      <div className="relative z-[2] mt-12 flex justify-center">
        <Link
          href="/alloggi/"
          className="group inline-flex items-center gap-2.5 rounded-[3px] bg-raspberry px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-cream transition-colors duration-200 hover:bg-[#8a3844]"
        >
          Tutti gli appartamenti
          <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}

export function ApartmentsCarousel() {
  const tier = useViewportTier();
  const reducedMotion = useReducedMotion();

  /* Niente overflow-x-hidden qui: essendo un antenato del div "sticky"
     dentro DesktopCarousel, forzava overflow-y:auto (per la regola CSS
     overflow-x non-visible => overflow-y computa ad auto) e questo rompeva
     completamente lo sticky, che si limitava a scorrere insieme alla
     pagina invece di restare fissato in viewport durante lo scroll — il
     bug "il sito scorre e basta" segnalato in review. Il clipping
     orizzontale delle card fantasma resta garantito dall'overflow-hidden
     già presente sul div sticky stesso (non un antenato, quindi sicuro). */
  return (
    <section id="section-apartments" data-snap-exempt="true" className="relative bg-[#f1f1f1]">
      {reducedMotion ? (
        <StaticGrid />
      ) : tier === "mobile" ? (
        <MobileCarousel reducedMotion={reducedMotion} />
      ) : (
        <DesktopCarousel reducedMotion={reducedMotion} />
      )}
    </section>
  );
}
