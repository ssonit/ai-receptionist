import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Eve",
  description: "Terms governing use of the Eve booking assistant.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="2026-07-26">
      <h2>The service</h2>
      <p>
        Eve provides an AI assistant that answers questions and books
        appointments on behalf of a business, using that business&apos;s own
        calendar. Eve is a scheduling tool. It does not provide medical, legal,
        financial or other professional advice.
      </p>
      <h2>Accounts</h2>
      <p>
        A business account owner is responsible for the accuracy of the
        information their assistant gives out, for the calendar credentials they
        connect, and for anyone they invite into their workspace.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use Eve to send unsolicited messages.</li>
        <li>Do not attempt to access another workspace&apos;s data.</li>
        <li>Do not abuse the public chat endpoints; usage is rate limited.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        The service is provided as-is, without warranty. Appointments depend on
        third-party calendar and email providers; we are not liable for missed
        appointments caused by their outages.
      </p>
      <h2>Contact</h2>
      <p>support@motionsite.pro</p>
    </LegalPage>
  );
}
