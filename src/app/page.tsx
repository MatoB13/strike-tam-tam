// The site root serves Strike tam-tam (on strike.matotam.io the same page is
// reached through a host rewrite to /strike).
import StrikeLayout, { metadata } from "./strike/layout";
import StrikePage from "./strike/page";

export { metadata };

export default function Home() {
  return (
    <StrikeLayout>
      <StrikePage />
    </StrikeLayout>
  );
}
