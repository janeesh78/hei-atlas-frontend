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
  ['9-b2b-exemptions', '9. B2B Exemptions & State Privacy Laws'],
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
          This Privacy Policy describes how Oncology Solutions (&ldquo;Company,&rdquo;
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
          &ldquo;Providers&rdquo;) utilizing the Oncology Solutions ambient scribe platform.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Business Associate Agreement (BAA):</span> Because our
            Services process Protected Health Information (PHI) governed by the Health Insurance
            Portability and Accountability Act (HIPAA), our relationship with healthcare providers
            is governed by a signed HIPAA Business Associate Agreement (BAA).
          </li>
          <li>
            <span className="font-medium">Precedence:</span> In the event of any conflict between
            this Privacy Policy, our Terms of Use, and the BAA, the terms of the BAA shall control
            with respect to any Protected Health Information (PHI).
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
            <span className="font-medium">Account Credentials:</span> Username, email address,
            corporate phone number, and password (which are strictly encrypted and salted).
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
            starts/stops, clinical note exports, and EHR integration attempts.
          </li>
        </ul>

        <h2 id="3-ambient-data-lifecycle" className="text-[16px] font-semibold mt-8 mb-2">
          3. The Ambient Data Lifecycle (Audio Deletion Policy)
        </h2>
        <p>
          To limit data exposure and safeguard patient privacy, Oncology Solutions operates on a
          strict transient storage workflow for all voice and conversational data:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">Immediate Audio Deletion:</span> Once raw audio of a
            clinical encounter is processed, converted into a text transcript, and utilized to
            generate the draft clinical note, the raw audio file is immediately and permanently
            deleted from our active cloud environments.
          </li>
          <li>
            <span className="font-medium">Transcript Purging:</span> Text transcripts utilized to
            compile the clinical notes are automatically deleted or securely archived in
            accordance with the retention periods specified in your hospital&rsquo;s Enterprise
            Agreement or BAA.
          </li>
          <li>
            <span className="font-medium">Draft Note Lifecycle:</span> Draft clinical notes remain
            in our secure, encrypted cloud space only until they are reviewed, finalized, and
            successfully exported to your Electronic Health Record (EHR) system, or up to a
            maximum duration dictated by your institution&rsquo;s configuration, after which they
            are purged.
          </li>
        </ul>

        <h2 id="4-how-we-process" className="text-[16px] font-semibold mt-8 mb-2">
          4. How We Process Your Information
        </h2>
        <p>
          Oncology Solutions processes your data strictly for legitimate clinical, administrative,
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
            <span className="font-medium">EHR Integration:</span> Securely transmitting finished
            medical records directly into your hospital&rsquo;s Electronic Health Record system.
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
            <span className="font-medium">With Your EHR and Clinical Systems:</span> Exporting
            completed clinical notes directly to your designated medical records software at your
            direction.
          </li>
          <li>
            <span className="font-medium">With HIPAA-Compliant Service Providers:</span> Disclosing
            data to technical infrastructure vendors (such as secure, US-based cloud hosting
            environments) who have signed strict Business Associate Agreements and are legally
            bound to protect the data.
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
            <span className="font-medium">Zero Training on Live Patient PHI:</span> Oncology
            Solutions does not use active Patient PHI, raw conversational audio, or live encounter
            transcripts to train public, third-party generative artificial intelligence models.
          </li>
          <li>
            <span className="font-medium">Secure Enterprise Environments:</span> Any AI model
            processing or natural language synthesis takes place inside virtual private clouds
            protected by enterprise-grade firewalls. Your clinical inputs are never exposed to
            public internet-facing machine learning tools.
          </li>
          <li>
            <span className="font-medium">De-Identified Product Improvement:</span> We may utilize
            fully de-identified and aggregated operational metadata (completely stripped of all 18
            HIPAA patient identifiers) solely to optimize our internal clinical terminology engines
            and language performance.
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
            payloads, and metadata are encrypted using transport-layer security (minimum TLS 1.3).
          </li>
          <li>
            <span className="font-medium">Data at Rest:</span> All transient storage, databases,
            and backup files are encrypted using Advanced Encryption Standard (AES-256).
          </li>
          <li>
            <span className="font-medium">Access Control:</span> Role-Based Access Controls (RBAC),
            multi-factor authentication (MFA), and automated session timeouts are strictly enforced
            for all clinical accounts.
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
            <span className="font-medium">Access &amp; Edits:</span> You have the absolute right
            and duty to review, edit, modify, or completely delete any draft note generated by the
            Platform before it is pushed to an EHR.
          </li>
          <li>
            <span className="font-medium">Account Deactivation:</span> You may deactivate your
            account at any time. Upon account termination, your data will be securely purged or
            anonymized in accordance with our system retention tables and the governing BAA.
          </li>
        </ul>

        <h2 id="9-b2b-exemptions" className="text-[16px] font-semibold mt-8 mb-2">
          9. B2B Exemptions &amp; State Privacy Laws
        </h2>
        <p>
          Oncology Solutions is a specialized, business-to-business (B2B) clinical platform
          operating exclusively for healthcare institutions and verified medical practitioners.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <span className="font-medium">State Consumer Law Exemptions:</span> Because our
            software processes data strictly within a professional B2B healthcare context and
            deals directly with Protected Health Information (PHI) governed by HIPAA, it is
            largely exempt from individual state-level consumer privacy acts (such as the
            California Consumer Privacy Act (CCPA), the Colorado Privacy Act (CPA), and similar
            state statutes).
          </li>
          <li>
            <span className="font-medium">Unified Federal Compliance:</span> We maintain a single,
            highly-stringent compliance standard rooted in HIPAA guidelines and federal privacy
            standards, rather than state-by-state consumer-focused opt-out frameworks.
          </li>
        </ul>

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
          Oncology Solutions
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
