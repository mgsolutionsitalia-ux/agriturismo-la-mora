import Image from "next/image";
import { Reveal } from "@/components/scroll-reveal";

/* Sezione "Sostenibilità": nasce per dare finalmente spazio pieno alla
   colonnina di ricarica (finora solo un item nel ticker/marquee e una tab
   in LaMoraDaVivere, mai una sezione a sé) dentro una cornice più ampia,
   richiesta esplicitamente dal titolare: gli investimenti energetici della
   struttura, con e-bike e ricarica elettrica come le due espressioni
   concrete rivolte agli ospiti. Le due voci restano ANCHE altrove
   (marquee, LaMoraDaVivere): questa sezione le racconta per esteso, non le
   sostituisce nei punti in cui già comparivano. Solo le 2 foto reali già
   presenti in public/servizi-extra: nessuna foto di pannelli solari è
   disponibile nel progetto, quindi non è stata inventata né simulata. */
const ITEMS = [
  {
    tag: "Mobilità dolce",
    title: "Noleggio e-bike",
    description:
      "Pedalata assistita per esplorare la campagna intorno ad Assisi senza fatica, anche in salita. Consegna e ritiro direttamente in struttura, a cura di Paolo.",
    note: "Da 15€ mezza giornata a 90€ per 7 giorni",
    img: "/images/servizi-extra/e-bike/immagine di due persone con ebike.webp",
    alt: "Ospiti in e-bike sulla strada di campagna vicino ad Agriturismo La Mora",
  },
  {
    tag: "Mobilità elettrica",
    title: "Ricarica auto elettriche",
    description:
      "Una colonnina da 22 kW è a disposizione degli ospiti nel parcheggio privato della struttura: bastano pochi minuti per fare il pieno di energia mentre si è in piscina o in giro per Assisi.",
    note: "Da segnalare in fase di prenotazione",
    img: "/images/servizi-extra/ricarica-elettrica/ricarica elettrica macchina.jpg",
    alt: "Colonnina di ricarica per auto elettriche nel parcheggio di Agriturismo La Mora",
  },
] as const;

export function SustainabilitySection() {
  return (
    <section aria-labelledby="sustainability-heading" className="bg-cream py-24 sm:py-28">
      <div className="mx-auto max-w-[1100px] px-6 sm:px-10">
        <Reveal className="mx-auto max-w-[700px] text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-olive-950">Sostenibilità</span>
          <h2
            id="sustainability-heading"
            className="mt-5 font-display text-[clamp(28px,3.4vw,44px)] font-normal leading-[1.2] text-ink [text-wrap:balance]"
          >
            Ospitalità che pesa poco sulla terra che la circonda.
          </h2>
          <p className="mt-6 text-[15px] leading-[1.7] text-ink-soft">
            Negli ultimi anni La Mora ha scelto di investire in impianti a basso impatto per ridurre il proprio
            consumo dalla rete elettrica, rendendo la struttura quasi autosufficiente dal punto di vista energetico.
            Un impegno che si estende anche alla mobilità dei nostri ospiti, con due servizi pensati per muoversi in
            modo più leggero.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:mt-16 md:grid-cols-2">
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={i * 120} className="group">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[3px]">
                <Image
                  src={item.img}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <span className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-terracotta">
                {item.tag}
              </span>
              <h3 className="mt-2 font-display text-2xl text-ink">{item.title}</h3>
              <p className="mt-2.5 text-[14px] leading-[1.7] text-ink-soft">{item.description}</p>
              <span className="mt-3 inline-block rounded-full border border-ink/15 px-3 py-1 text-[10.5px] font-medium text-ink-soft">
                {item.note}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
