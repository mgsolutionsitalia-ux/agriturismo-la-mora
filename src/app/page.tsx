import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { BookingBar } from "@/components/booking-bar";
import { BenefitMarquee } from "@/components/benefit-marquee";
import { ImmersiveStory } from "@/components/immersive-story";
import { ApartmentsCarousel } from "@/components/apartments-carousel";
import { StructureHighlights } from "@/components/structure-highlights";
import { OutdoorLife } from "@/components/outdoor-life";
import { SustainabilitySection } from "@/components/sustainability-section";
import { TerritorySection } from "@/components/territory-section";
import { ReviewsSection } from "@/components/reviews-section";
import { DirectBooking } from "@/components/direct-booking";
import { BlogSection } from "@/components/blog-section";
import { InstagramGallery } from "@/components/instagram-gallery";
import { LocationMap } from "@/components/location-map";
import { LaMoraDaVivere } from "@/components/la-mora-da-vivere";
import { NewsletterSection } from "@/components/newsletter-section";
import { CertificationsMarquee } from "@/components/certifications-marquee";
import { SiteFooter } from "@/components/site-footer";
import { ConciergeChat } from "@/components/concierge-chat";
import { PromoPopup } from "@/components/promo-popup";
import { SectionProgressDots } from "@/components/section-progress-dots";
import { BackToTop } from "@/components/back-to-top";
import { SectionSnapScroll } from "@/components/section-snap-scroll";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "LodgingBusiness",
  name: "Agriturismo La Mora",
  image: "https://www.agriturismoinassisi.it/images/piscina/piscina%20agriturismo%20la%20mora.webp",
  url: "https://www.agriturismoinassisi.it",
  telephone: "+39 075 8041164",
  email: "agriturismolamora@gmail.com",
  priceRange: "€€",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Via Fonte Citerna, 7",
    addressLocality: "Assisi",
    addressRegion: "PG",
    postalCode: "06081",
    addressCountry: "IT",
  },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Hero />
        <BenefitMarquee />
        <ImmersiveStory />
        <ApartmentsCarousel />
        <StructureHighlights />
        <InstagramGallery />
        <BlogSection />
        <OutdoorLife />
        <SustainabilitySection />
        <TerritorySection />
        <ReviewsSection />
        <DirectBooking />
        <LaMoraDaVivere />
        <LocationMap />
        <NewsletterSection />
        <CertificationsMarquee />
      </main>
      <SiteFooter />
      {/* Widget di prenotazione persistente: fixed, indipendente dal flusso
          della pagina, resta visibile dalla hero fino in fondo (si dissolve
          in prossimità del footer, vedi booking-bar.tsx). */}
      <BookingBar />
      <ConciergeChat />
      <PromoPopup />
      <SectionProgressDots />
      <BackToTop />
      <SectionSnapScroll />
    </>
  );
}
