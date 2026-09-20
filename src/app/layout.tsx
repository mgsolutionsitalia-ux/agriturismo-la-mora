import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.agriturismoinassisi.it"),
  title: {
    default: "Agriturismo La Mora | Agriturismo con piscina ad Assisi, Umbria",
    template: "%s | Agriturismo La Mora",
  },
  description:
    "Agriturismo La Mora, ad Assisi: 5 appartamenti immersi nel verde umbro, piscina panoramica, colazione bio e attività per famiglie. A 7 km dall'aeroporto di Perugia.",
  icons: {
    icon: "/images/favicon/favicon%20icona%20agriturismo%20la%20mora.png",
    apple: "/images/favicon/favicon%20icona%20agriturismo%20la%20mora.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${cormorant.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">
        <a href="#main" className="skip-link">
          Vai al contenuto principale
        </a>
        {children}
        {/* Widget camere di bed-and-breakfast.it: apre una modale di selezione
            stanze/richiesta disponibilità quando si clicca un elemento con
            classe "rrp-widget-open-modal" (vedi booking-bar.tsx e
            apartments-carousel.tsx). Booking engine proprietario è fuori
            scope in questa fase (PLAN.md): questo widget è la prenotazione
            reale e funzionante nel frattempo, mascherata dietro la grafica
            del sito. Tag <script> nativo (non next/script) voluto: lo script
            del fornitore usa document.write() per iniettare markup/CSS, che
            il browser blocca sugli script caricati in modo asincrono (come
            fa next/script con qualunque strategy) — deve restare un classico
            script sincrono, posizionato esattamente dove le istruzioni del
            fornitore richiedono: subito prima della chiusura di </body>. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://www.bed-and-breakfast.it/scripts/widget/widget_frm_camere.cfm?idstruttura=60754&idregione=18&l=it" />
      </body>
    </html>
  );
}
