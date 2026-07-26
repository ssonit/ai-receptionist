import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Eve",
  description: "How Eve collects, uses and stores booking data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="2026-07-26">
      <h2>What we collect</h2>
      <p>
        When you chat with an Eve booking assistant we store the messages you
        send, plus any contact details you provide (name, phone number, email)
        and the appointments you book. We also set a first-party cookie to
        recognise your chat session so you can manage your own bookings without
        an account.
      </p>
      <h2>Why we collect it</h2>
      <ul>
        <li>To create, cancel and reschedule appointments on your behalf.</li>
        <li>To send appointment reminders, if the business enables them.</li>
        <li>To let the business you contacted follow up with you.</li>
      </ul>
      <h2>Who can see it</h2>
      <p>
        Your data is visible to the business whose booking page you used, and to
        our calendar provider (Cal.com) for the appointment itself. Reminder and
        verification emails are delivered by Resend. We do not sell your data.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Chat sessions, leads and bookings are retained for as long as the
        business keeps its Eve account. You can ask us to delete your data using
        the contact address below.
      </p>
      <h2>Your choices</h2>
      <p>
        Every reminder email includes an unsubscribe link that stops further
        reminders for that booking. To request access to or deletion of your
        data, contact us.
      </p>
      <h2>Contact</h2>
      <p>support@motionsite.pro</p>
    </LegalPage>
  );
}
