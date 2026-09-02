export const metadata = { title: 'Privacy Policy — Hei Atlas' };

const TOC = [
  ['1-scope-hipaa-compliance', '1. Scope & HIPAA Compliance'],
  ['2-information-we-collect', '2. Information We Collect & How We Collect It'],
  ['3-ambient-data-lifecycle', '3. The Ambient Data Lifecycle (Audio Deletion Policy)'],
  ['4-how-we-process', '4. How We Process Your Information'],
  ['5-sharing-disclosure', '5. Sharing and Disclosure of Information'],
  ['6-ai-training-safeguards', '6. AI Model Training & Data Safeguards'],
  ['7-security-encryption', '7. Enterprise Security & Encryption'],
  ['8-your-rights', '8. Your Rights and Choices'],
  ['9-b2b-exemptions', '9. State Privacy Laws'],
  ['10-changes-contact', '10. Changes to This Policy & Contact Info'],
] as const;

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas px-4 py-12 safe-x">
      <div className="mx-auto max-w-2xl ds-card p-8 text-ink text-[14px] leading-relaxed">
        <h1 className="text-[22px] font-semibold mb-4">
          Privacy Policy: Ambient Clinical Intelligence Platform
        </h1>
        <p className="text-muted mb-6">Effective Date: July 15, 2026</p>

        <p>
          This Privacy Policy describes how Oncology Solutions LLC (&ldquo;Company,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, stores,
          discloses, and safeguards personal information and Protected Health Information (PHI)
          processed through our medical ambient listening software, applications, APIs, and
          associated services (collectively, the &ldquo;Platform&rdquo; or
          &ldquo;Services&rdquo;).
        </p>
        <p className="mt-4">
          This policy is specifically tailored to the unique privacy demands of ambient clinical
          recording, automated clinical documentation, and medical terminology processing.
        </p>

        <h2 className="text-[16px] font-semibold mt-8 mb-2">Table of Contents</h2>
        <ol className="list-decimal pl-5 space-y-1">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a className="text-accent" href={`#${id}`}>
                {label}
              </a>
            </li>
          ))}
        </ol>

        <h2 id="1-scope-hipaa-compliance" className="text-[16px] font-semibold mt-8 mb-2">
          1. Scope &amp; HIPAA Compliance
        </h2>
        <p>
          This Privacy Policy applies to licensed healthcare professionals, clinical staff, and
          enterprise health systems (collectively, &ldquo;Users&rdquo; or
          &ldquo;Providers&rdquo;) utilizing the Oncology Solutions LLC ambient scribe platform.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Business Associate Agreement (BAA) Status:</span> Our
            Services are designed for use with Protected Health Information (PHI) governed by the
            Health Insurance Portability and Accountability Act (HIPAA). As of the date of this
            policy, we have not yet executed a Business Associate Agreement with individual Users
            or with our infrastructure and AI sub-processors. Until a BAA is executed and in
            effect for your account, do not enter real, individually identifiable patient
            information anywhere in the Platform (full name, date of birth, medical record
            number, or similar) — use a de-identified handle such as initials or a private code
            for the patient-identifier field, which the Platform is designed to accept in place
            of a formal identifier. We will update this Privacy Policy and notify Users before
            processing identifiable PHI under an executed BAA.
          </li>
          <li>
            <span className="font-medium">Precedence:</span> If and when a Business Associate
            Agreement is executed between us and a User or covered entity, its terms will control
            over this Privacy Policy and our Terms of Use with respect to any Protected Health
            Information (PHI) covered by that agreement.
          </li>
        </ul>

        <h2 id="2-information-we-collect" className="text-[16px] font-semibold mt-8 mb-2">
          2. Information We Collect &amp; How We Collect It
        </h2>
        <p className="font-medium mt-3">A. User Account &amp; Credential Information (Disclosed by You)</p>
        <p>
          We collect registration and identity verification details to ensure only authorized,
          licensed professionals access the Platform:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Professional Credentials:</span> Name, National Provider
            Identifier (NPI), medical specialty, clinical license numbers, and affiliated
            healthcare institution.
          </li>
          <li>
            <span className="font-medium">Account Credentials:</span> Email address and an
            optional phone number. The Platform is passwordless — sign-in uses a one-time code
            sent to your email, verified against your NPI, rather than a stored password.
          </li>
        </ul>
        <p className="font-medium mt-4">B. Ambient Audio &amp; Clinical Consultation Data (Collected in Real-Time)</p>
        <p>
          During patient-provider consultations, when actively initiated by the Provider, the
          Platform captures:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Ambient Audio Recordings:</span> Temporary raw audio of
            the verbal dialogue between the clinician, patient, and any present third parties.
          </li>
          <li>
            <span className="font-medium">Encounter Transcripts:</span> Automated text transcripts
            generated from the captured audio.
          </li>
          <li>
            <span className="font-medium">Generated Notes:</span> Structured clinical summaries,
            SOAP notes, and patient instructions generated by our clinical AI.
          </li>
        </ul>
        <p className="font-medium mt-4">C. Automated Operational Logs (Collected Automatically)</p>
        <p>
          To maintain security, track audit logs required by HIPAA, and diagnose technical errors,
          we automatically record:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Device Details:</span> IP address, browser type,
            operating system, hardware model, and unique device identifiers.
          </li>
          <li>
            <span className="font-medium">Access Metrics:</span> Timestamps of logins, recording
            starts/stops, and note-generation activity.
          </li>
        </ul>

        <h2 id="3-ambient-data-lifecycle" className="text-[16px] font-semibold mt-8 mb-2">
          3. The Ambient Data Lifecycle (Audio Deletion Policy)
        </h2>
        <p>
          To limit data exposure and safeguard patient privacy, Oncology Solutions LLC operates on a
          strict transient storage workflow for all voice and conversational data:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Raw Audio:</span> Audio is streamed to our transcription
            provider for processing and is not written to durable storage on our servers at any
            point — it exists only transiently in memory/temporary files for the duration of that
            processing request.
          </li>
          <li>
            <span className="font-medium">Transcripts, Notes, and Related Data:</span> Once saved,
            the transcript, generated note, coding, and toxicity data for an encounter are retained
            for a fixed 24-hour window and then automatically and permanently deleted — this
            applies uniformly to every encounter and every User; it is not configurable per
            institution or hospital agreement.
          </li>
        </ul>

        <h2 id="4-how-we-process" className="text-[16px] font-semibold mt-8 mb-2">
          4. How We Process Your Information
        </h2>
        <p>
          Oncology Solutions LLC processes your data strictly for legitimate clinical, administrative,
          and security purposes:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Clinical Note Generation:</span> Utilizing advanced
            machine learning models to synthesize ambient conversations into accurate, structured
            medical draft notes.
          </li>
          <li>
            <span className="font-medium">Credential &amp; Licensing Audits:</span> Validating NPI
            numbers against national registries to prevent credential fraud or unauthorized
            clinical access.
          </li>
          <li>
            <span className="font-medium">HIPAA Compliance Auditing:</span> Maintaining immutable
            audit logs of which authorized accounts accessed, modified, or exported clinical data.
          </li>
        </ul>

        <h2 id="5-sharing-disclosure" className="text-[16px] font-semibold mt-8 mb-2">
          5. Sharing and Disclosure of Information
        </h2>
        <p>
          We do not sell, license, or rent patient clinical data or provider information. We only
          share information under the following strictly controlled circumstances:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">With Infrastructure and AI Vendors:</span> We use
            third-party providers for hosting, database storage, and AI-based transcription and
            note generation. As noted in Section 1, Business Associate Agreements with these
            vendors are not yet executed — see that section for what this means for real patient
            information today.
          </li>
          <li>
            <span className="font-medium">For Legal &amp; Safety Mandates:</span> Where required by
            federal law, court order, or to defend against legal claims, or to protect the safety
            and security of patients and clinicians.
          </li>
        </ul>

        <h2 id="6-ai-training-safeguards" className="text-[16px] font-semibold mt-8 mb-2">
          6. AI Model Training &amp; Data Safeguards
        </h2>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">AI Providers Used:</span> Transcription and note
            generation are performed by sending encrypted requests over HTTPS to third-party AI
            providers (currently OpenAI for transcription and Anthropic for note generation). These
            are the same providers&rsquo; standard API products, not a dedicated private deployment
            we operate — see Section 1 for BAA status with these providers.
          </li>
          <li>
            <span className="font-medium">Model Training:</span> Under these providers&rsquo;
            standard API terms, data submitted through their APIs is not used to train their
            general-purpose models by default. We do not separately use your clinical inputs to
            train any model of our own.
          </li>
        </ul>

        <h2 id="7-security-encryption" className="text-[16px] font-semibold mt-8 mb-2">
          7. Enterprise Security &amp; Encryption
        </h2>
        <p>
          We utilize robust administrative, physical, and technical safeguards designed to exceed
          industry healthcare standards:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Data in Transit:</span> All audio transmissions, API
            payloads, and metadata are encrypted in transit via HTTPS/TLS, including
            HTTP-Strict-Transport-Security (HSTS) so browsers never fall back to an unencrypted
            connection.
          </li>
          <li>
            <span className="font-medium">Data at Rest:</span> Our database provider encrypts all
            stored data at rest using AES-256.
          </li>
          <li>
            <span className="font-medium">Access Control:</span> Sign-in requires a one-time code
            sent to your verified email (no password to be phished or reused), and sessions
            automatically time out after a period of inactivity. We do not currently offer a
            second authentication factor beyond the one-time code, or role-based permission tiers
            beyond a single administrative role used for internal oversight.
          </li>
        </ul>

        <h2 id="8-your-rights" className="text-[16px] font-semibold mt-8 mb-2">
          8. Your Rights and Choices
        </h2>
        <p>As a licensed clinical user, you maintain control over your data:</p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Audio Interruption:</span> You can pause, stop, or delete
            a live ambient recording at any point during a clinical encounter.
          </li>
          <li>
            <span className="font-medium">Access &amp; Edits:</span> You have the right and duty to
            review, edit, and correct any draft note the Platform generates before relying on it.
          </li>
          <li>
            <span className="font-medium">Data Access and Deletion:</span> You can request a full
            export of everything we hold about your account, or request permanent deletion of your
            account and all associated data, by contacting us at the email below. Deletion is
            irreversible and, once processed, removes your encounters, notes, preferences, and
            account record — see Section 1 for how PHI handling changes once a BAA is in effect.
          </li>
        </ul>

        <h2 id="9-b2b-exemptions" className="text-[16px] font-semibold mt-8 mb-2">
          9. State Privacy Laws
        </h2>
        <p>
          Hei Atlas is currently used directly by individual licensed practitioners who sign up
          themselves, rather than exclusively through institutional or hospital contracts. Whether
          a particular state consumer privacy law (such as the California Consumer Privacy Act or
          the Colorado Privacy Act) applies to your use of the Platform, and to what extent, depends
          on your specific circumstances and jurisdiction. We are not asserting a blanket exemption
          from state privacy law here, and you should not rely on this policy as legal advice about
          which laws apply to you. If you have questions about your rights under a specific state
          law, please contact us using the information in Section 10.</p>

        <h2 id="10-changes-contact" className="text-[16px] font-semibold mt-8 mb-2">
          10. Changes to This Policy &amp; Contact Info
        </h2>
        <p>
          We may update this Privacy Policy from time to time to reflect evolving regulatory
          frameworks or new software capabilities. When changes are made, we will update the
          &ldquo;Effective Date&rdquo; at the top of this document and provide prominent
          notifications inside your provider dashboard.
        </p>
        <p className="mt-4">
          For compliance audits, questions regarding this policy, or concerns about data
          processing, please contact us at:
        </p>
        <p className="mt-2">
          Oncology Solutions LLC
          <br />
          Email:{' '}
          <a className="text-accent" href="mailto:compliance@oncologysolutions.us">
            compliance@oncologysolutions.us
          </a>
        </p>
      </div>
    </main>
  );
}
