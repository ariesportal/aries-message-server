<!-- ===================================================================
     A.R.I.E.S. Digital Intake Form — Squarespace Code Block

     This goes on its own dedicated page (create a new page in
     Squarespace — can be unlisted/hidden from navigation if you'd
     rather only share it via direct link — then add a Code Block to
     that page's content area and paste this whole thing in).

     Fully self-contained — no login, no backend, nothing saved
     anywhere automatically. The member fills it out, then either:
       - Clicks "PRINT / SAVE AS PDF" to generate a real PDF via their
         browser's own print dialog (choosing "Save as PDF" as the
         destination), then attaches that PDF to an email to you, OR
       - Clicks "COPY SUMMARY" to copy a clean text version to their
         clipboard, then pastes it directly into an email body to you.
     Either way, sending it back to A.R.I.E.S. is still a manual step —
     this just makes filling it out and generating a copy easier than
     the original static PDF.
=================================================================== -->
<style>

  /* =====================================================
     A.R.I.E.S. Digital Intake Form
     Fully self-contained — no login, no backend, nothing saved
     anywhere automatically. Fill it out, then either:
       - Click "PRINT / SAVE AS PDF" to generate a real PDF via your
         browser's own print dialog (choose "Save as PDF" as the
         destination), then attach that PDF to an email, OR
       - Click "COPY SUMMARY" to copy a clean text version to your
         clipboard, then paste it directly into an email body.
     Either way, sending it to A.R.I.E.S. is still a manual step —
     this just makes filling it out and generating your copy easier
     than the original static PDF.
  ===================================================== */
  * { box-sizing: border-box; }
  body {
    background: #000000;
    color: #ffd400;
    font-family: 'Courier New', monospace;
    margin: 0;
    padding: 30px 16px 80px;
  }
  #wrap { max-width: 800px; margin: 0 auto; }
  header { text-align: center; margin-bottom: 30px; }
  header h1 { font-size: 20px; letter-spacing: 1px; margin-bottom: 6px; }
  header p { font-size: 11px; opacity: 0.7; letter-spacing: 1px; text-transform: uppercase; }
  .note-banner {
    background: #0a0900;
    border: 1px solid rgba(255,212,0,0.35);
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 11px;
    line-height: 1.6;
    margin-bottom: 26px;
  }
  section { margin-bottom: 30px; }
  .section-title {
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1.5px;
    color: #ffd400;
    border-bottom: 1px solid rgba(255,212,0,0.3);
    padding-bottom: 8px;
    margin-bottom: 6px;
  }
  .section-hint { font-size: 10px; opacity: 0.55; margin-bottom: 14px; line-height: 1.5; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 10.5px; letter-spacing: 0.5px; opacity: 0.75; margin-bottom: 5px; }
  input[type="text"], input[type="email"], input[type="tel"], input[type="date"], textarea {
    width: 100%;
    background: #0a0900;
    border: 1px solid rgba(255,212,0,0.4);
    color: #ffd400;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    padding: 9px 12px;
    border-radius: 6px;
    outline: none;
  }
  textarea { min-height: 60px; resize: vertical; }
  .radio-row, .checkbox-row { display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .checkbox-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px 16px; }
  .radio-item, .checkbox-item { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .radio-item input, .checkbox-item input { width: auto; }
  #actions {
    position: sticky;
    bottom: 0;
    background: #000000;
    border-top: 1px solid rgba(255,212,0,0.3);
    padding: 16px;
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 30px;
  }
  #actions button {
    font-family: 'Courier New', monospace;
    font-weight: bold;
    font-size: 12px;
    letter-spacing: 0.5px;
    padding: 12px 22px;
    border-radius: 999px;
    cursor: pointer;
    border: none;
  }
  #printBtn { background: #ffd400; color: #000; }
  #copyBtn { background: transparent; color: #ffd400; border: 1px solid rgba(255,212,0,0.5) !important; }
  #copyConfirm { font-size: 10px; color: #7CFC00; text-align: center; margin-top: 8px; min-height: 14px; }

  /* ---- print styling: switch to a clean printable document ---- */
  @media print {
    body { background: #ffffff; color: #000000; padding: 0; }
    .note-banner { display: none; }
    #actions { display: none; }
    #copyConfirm { display: none; }
    input, textarea {
      background: #ffffff; color: #000000; border: 1px solid #999999;
    }
    .section-title { color: #000000; border-bottom-color: #000000; }
    section { page-break-inside: avoid; }
  }
</style>

<div id="wrap">
  <header>
    <h1>A.R.I.E.S. PORTAL — INVESTIGATOR &amp; COMPANY INTAKE FORM</h1>
    <p>Advanced Research &amp; Investigation Evidence Services</p>
  </header>

  <div class="note-banner">
    Fill out the sections below, then click "SUBMIT FORM" — this sends your
    completed form directly to A.R.I.E.S. by email. You can also click
    "DOWNLOAD PDF" first to keep your own copy for your records.
  </div>

  <form id="intakeForm"></form>

  <!-- hidden honeypot field: invisible to real people, but bots that
       auto-fill every field on a page will often fill this in too,
       letting us quietly discard likely-spam submissions -->
  <input type="text" id="honeypot" name="honeypot" autocomplete="off" style="position:absolute;left:-9999px;" tabindex="-1" aria-hidden="true">

  <div id="actions">
    <button type="button" id="printBtn">DOWNLOAD PDF (OPTIONAL)</button>
    <button type="button" id="submitBtn">SUBMIT FORM</button>
  </div>
  <div id="submitStatus"></div>
</div>

<script>
(function () {
  // =========================================================
  // SCHEMA — matches the original A.R.I.E.S. Investigator &
  // Company Intake Form. Section 11 (staff-only verification) is
  // intentionally left out — that's for A.R.I.E.S. internal review
  // after you receive the completed form back, not something the
  // member fills in.
  // =========================================================
  var SCHEMA = [
    { title: "1. Membership Information", fields: [
      { key: "membershipTier", label: "Membership Tier", type: "checkboxes", options: ["Standard Investigator", "Premium Investigator", "Standard Company", "Premium Company"] },
      { key: "investigatorOrCompanyName", label: "Investigator / Company Name", type: "text" },
      { key: "primaryContactName", label: "Primary Contact Name", type: "text" },
      { key: "title", label: "Title / Position", type: "text" },
      { key: "primaryContactEmail", label: "Primary Contact Email", type: "email" },
      { key: "primaryContactPhone", label: "Primary Contact Phone", type: "tel" }
    ]},
    { title: "2. Investigator / Company Information", hint: "Private investigators: skip company-specific fields that do not apply to your individual practice. Enter \u201cN/A\u201d if a field doesn't apply.", fields: [
      { key: "companyName", label: "Company / Professional Name", type: "text" },
      { key: "companyWebsite", label: "Company Website", type: "text" },
      { key: "primaryOfficeAddress", label: "Primary Office Address", type: "text" },
      { key: "cityStateZip", label: "City / State / ZIP", type: "text" },
      { key: "county", label: "County", type: "text" },
      { key: "mainOfficePhone", label: "Main Office Phone", type: "tel" },
      { key: "salesPhone", label: "Sales / Business Development Phone", type: "tel" },
      { key: "regionalOfficePhone", label: "Regional Office Phone", type: "tel" },
      { key: "faxNumber", label: "Fax Number", type: "tel" },
      { key: "generalCompanyEmail", label: "General Company Email", type: "email" },
      { key: "salesEmail", label: "Sales / Business Development Email", type: "email" }
    ]},
    { title: "3. Multiple Field Offices", hint: "Skip this section if you do not operate multiple field offices.", fields: [
      { key: "hasMultipleOffices", label: "Does your company operate multiple field offices?", type: "radio", options: ["No — Single Office", "Yes — Multiple Field Offices"] },
      { key: "numFieldOffices", label: "Approximate Number of Field Offices", type: "text" },
      { key: "fieldOfficesContact", label: "Primary Contact for Field Offices", type: "text" },
      { key: "fieldOfficesEmail", label: "Email", type: "email" },
      { key: "fieldOfficesPhone", label: "Phone", type: "tel" },
      { key: "statesWithFieldOffices", label: "States With Field Offices", type: "text" }
    ]},
    { title: "4. Service Area", fields: [
      { key: "serviceArea", label: "Service Area", type: "checkboxes", options: ["Local", "Regional", "Statewide", "Multi-State", "Nationwide"] },
      { key: "statesServed", label: "States Served", type: "textarea" },
      { key: "citiesCountiesServed", label: "Cities / Counties Served", type: "textarea" }
    ]},
    { title: "5. Investigative Services", fields: [
      { key: "services", label: "Services Offered", type: "checkboxes", options: [
        "Surveillance", "Workers' Compensation Investigations", "Insurance Investigations", "Liability Investigations",
        "Infidelity Investigations", "Background Investigations", "Skip Tracing / Locate Services", "Missing Persons",
        "Asset Searches", "Fraud Investigations", "Corporate Investigations", "Employment Investigations",
        "Internal Investigations", "Criminal Defense Investigations", "Civil Investigations", "Family / Domestic Investigations",
        "Child Custody Investigations", "Process Serving", "Witness Locating", "Statement / Interview Services",
        "Undercover Investigations", "Counter-Surveillance", "Digital Investigations", "Cyber Investigations",
        "Computer / Mobile Forensics", "Social Media Investigations", "Accident Investigations", "Accident Reconstruction",
        "Due Diligence Investigations", "Litigation Support", "Recorded Statements", "Photography / Videography",
        "GPS / Tracking Services", "Mystery Shopping", "Retail Investigations", "SIU Services", "Security Consulting"
      ]},
      { key: "otherService", label: "Other Service", type: "text" },
      { key: "additionalServices", label: "Additional Services / Specialties", type: "textarea" }
    ]},
    { title: "6. Professional Information", fields: [
      { key: "yearsInBusiness", label: "Years in Business / Years Practicing", type: "text" },
      { key: "professionalSpecialties", label: "Professional Specialties", type: "textarea" },
      { key: "professionalCertifications", label: "Professional Certifications", type: "textarea" },
      { key: "professionalAssociations", label: "Professional Associations", type: "textarea" },
      { key: "languagesSpoken", label: "Additional Languages Spoken", type: "text" }
    ]},
    { title: "7. License & Verification Information", fields: [
      { key: "licenseRequired", label: "Is a professional or investigative license required for your services in your state?", type: "radio", options: ["Yes", "No", "Not Applicable"] },
      { key: "licenseNumber", label: "License / Registration Number", type: "text" },
      { key: "issuingState", label: "Issuing State", type: "text" },
      { key: "licenseExpiration", label: "License Expiration Date", type: "date" },
      { key: "additionalLicenseInfo", label: "Additional License Information", type: "textarea" },
      { key: "licenseDocNote", label: "License / Verification Documentation", type: "note", note: "Please attach your license documentation as a separate file with your email." }
    ]},
    { title: "8. Company Rating & Online Reviews", hint: "Skip company-specific rating fields if they do not apply to your individual practice.", fields: [
      { key: "googleRating", label: "Google — Rating / Grade", type: "text" },
      { key: "googleReviews", label: "Google — Number of Reviews", type: "text" },
      { key: "googleLink", label: "Google — Profile / Review Link", type: "text" },
      { key: "yelpRating", label: "Yelp — Rating / Grade", type: "text" },
      { key: "yelpReviews", label: "Yelp — Number of Reviews", type: "text" },
      { key: "yelpLink", label: "Yelp — Profile / Review Link", type: "text" },
      { key: "bbbRating", label: "Better Business Bureau — Rating / Grade", type: "text" },
      { key: "bbbReviews", label: "BBB — Number of Reviews", type: "text" },
      { key: "bbbLink", label: "BBB — Profile / Review Link", type: "text" },
      { key: "otherReviewPlatform", label: "Other Review Platform Name", type: "text" },
      { key: "otherRating", label: "Other — Rating / Grade", type: "text" },
      { key: "otherReviews", label: "Other — Number of Reviews", type: "text" },
      { key: "otherLink", label: "Other — Profile / Review Link", type: "text" }
    ]},
    { title: "9. Directory Listing", fields: [
      { key: "publicListingName", label: "Public Listing Name", type: "text" },
      { key: "publicPhone", label: "Public Phone Number", type: "tel" },
      { key: "publicEmail", label: "Public Email", type: "email" },
      { key: "publicWebsite", label: "Public Website", type: "text" },
      { key: "addressDisplay", label: "Address Display", type: "radio", options: ["Display Full Address", "Display City / State Only"] },
      { key: "description", label: "Company / Investigator Description", type: "textarea" },
      { key: "logoNote", label: "Company / Investigator Logo", type: "note", note: "Please attach your logo file as a separate file with your email." }
    ]},
    { title: "10. Social Media & Online Presence", fields: [
      { key: "facebook", label: "Facebook", type: "text" },
      { key: "linkedin", label: "LinkedIn", type: "text" },
      { key: "instagram", label: "Instagram", type: "text" },
      { key: "otherSocial", label: "Other", type: "text" },
      { key: "additionalProfiles", label: "Additional Online Profiles / Links", type: "textarea" }
    ]},
    { title: "11. Member Certification", hint: "By submitting this form, you confirm: the information provided is accurate and current to the best of your knowledge; you understand A.R.I.E.S. may review and verify submitted information; you authorize A.R.I.E.S. Portal to use this information to create and maintain your directory listing; you understand submission does not guarantee publication of every item; and you understand A.R.I.E.S. may contact you if additional information or documentation is required.", fields: [
      { key: "certName", label: "Name", type: "text" },
      { key: "certTitle", label: "Title", type: "text" },
      { key: "certSignature", label: "Electronic Signature (type your full name)", type: "text" },
      { key: "certDate", label: "Date", type: "date" },
      { key: "certAgree", label: "I certify the above statements are true and agree to the terms above", type: "singleCheckbox" }
    ]}
  ];
  // =========================================================

  function fieldId(key) { return "field-" + key; }

  var form = document.getElementById("intakeForm");
  SCHEMA.forEach(function (section) {
    var sectionEl = document.createElement("section");

    var titleEl = document.createElement("div");
    titleEl.className = "section-title";
    titleEl.textContent = section.title;
    sectionEl.appendChild(titleEl);

    if (section.hint) {
      var hintEl = document.createElement("div");
      hintEl.className = "section-hint";
      hintEl.textContent = section.hint;
      sectionEl.appendChild(hintEl);
    }

    section.fields.forEach(function (field) {
      sectionEl.appendChild(renderField(field));
    });

    form.appendChild(sectionEl);
  });

  function renderField(field) {
    var wrap = document.createElement("div");
    wrap.className = "field";

    if (field.type === "singleCheckbox") {
      var label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = fieldId(field.key);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(field.label));
      wrap.appendChild(label);
      return wrap;
    }

    if (field.type === "note") {
      var labelEl0 = document.createElement("label");
      labelEl0.textContent = field.label;
      wrap.appendChild(labelEl0);
      var noteEl = document.createElement("div");
      noteEl.style.fontSize = "10px";
      noteEl.style.opacity = "0.6";
      noteEl.style.fontStyle = "italic";
      noteEl.textContent = field.note;
      wrap.appendChild(noteEl);
      return wrap;
    }

    var labelEl = document.createElement("label");
    labelEl.textContent = field.label;
    labelEl.setAttribute("for", fieldId(field.key));
    wrap.appendChild(labelEl);

    if (field.type === "textarea") {
      var textarea = document.createElement("textarea");
      textarea.id = fieldId(field.key);
      wrap.appendChild(textarea);
    } else if (field.type === "radio") {
      var radioGroup = document.createElement("div");
      radioGroup.className = "radio-row";
      radioGroup.id = fieldId(field.key);
      field.options.forEach(function (opt) {
        var item = document.createElement("label");
        item.className = "radio-item";
        var input = document.createElement("input");
        input.type = "radio";
        input.name = field.key;
        input.value = opt;
        item.appendChild(input);
        item.appendChild(document.createTextNode(opt));
        radioGroup.appendChild(item);
      });
      wrap.appendChild(radioGroup);
    } else if (field.type === "checkboxes") {
      var cbGroup = document.createElement("div");
      cbGroup.className = "checkbox-grid";
      cbGroup.id = fieldId(field.key);
      field.options.forEach(function (opt) {
        var item = document.createElement("label");
        item.className = "checkbox-item";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.value = opt;
        item.appendChild(input);
        item.appendChild(document.createTextNode(opt));
        cbGroup.appendChild(item);
      });
      wrap.appendChild(cbGroup);
    } else {
      var input2 = document.createElement("input");
      input2.type = field.type;
      input2.id = fieldId(field.key);
      wrap.appendChild(input2);
    }
    return wrap;
  }

  // ---- shared: build a clean plain-text summary of every answer ----
  function buildSummaryText() {
    var lines = ["A.R.I.E.S. PORTAL — INVESTIGATOR & COMPANY INTAKE FORM", ""];
    SCHEMA.forEach(function (section) {
      lines.push(section.title);
      lines.push("-".repeat(section.title.length));
      section.fields.forEach(function (field) {
        if (field.type === "note") return;
        var value = "";
        if (field.type === "singleCheckbox") {
          var cb = document.getElementById(fieldId(field.key));
          value = cb && cb.checked ? "Yes" : "No";
        } else if (field.type === "radio") {
          var checked = document.querySelector('input[name="' + field.key + '"]:checked');
          value = checked ? checked.value : "(not answered)";
        } else if (field.type === "checkboxes") {
          var groupEl = document.getElementById(fieldId(field.key));
          var checkedBoxes = groupEl.querySelectorAll("input:checked");
          value = checkedBoxes.length
            ? Array.prototype.map.call(checkedBoxes, function (b) { return b.value; }).join(", ")
            : "(none selected)";
        } else {
          var el = document.getElementById(fieldId(field.key));
          value = (el && el.value.trim()) || "(blank)";
        }
        lines.push(field.label + ": " + value);
      });
      lines.push("");
    });
    return lines.join("\n");
  }

  // ---- print / save as PDF (kept as an optional personal backup copy) ----
  document.getElementById("printBtn").addEventListener("click", function () {
    window.print();
  });

  // ---- submit: sends the completed form straight to A.R.I.E.S. by email ----
  // =========================================================
  // Same Render backend as your Message Center / Member Dashboard.
  // =========================================================
  var SERVER_URL = "https://aries-message-server.onrender.com";
  // =========================================================

  document.getElementById("submitBtn").addEventListener("click", function () {
    var statusEl = document.getElementById("submitStatus");
    var nameField = document.getElementById(fieldId("investigatorOrCompanyName"));
    var emailField = document.getElementById(fieldId("primaryContactEmail"));
    var agreeField = document.getElementById(fieldId("certAgree"));

    if (!nameField.value.trim() || !emailField.value.trim()) {
      statusEl.style.color = "#ff6b6b";
      statusEl.textContent = "Please fill in at least your name and contact email before submitting.";
      return;
    }
    if (!agreeField.checked) {
      statusEl.style.color = "#ff6b6b";
      statusEl.textContent = "Please check the certification box in Section 11 before submitting.";
      return;
    }

    statusEl.style.color = "#ffd400";
    statusEl.textContent = "Submitting… (this can take up to ~30s if the server was asleep)";

    var summary = buildSummaryText();
    var subject = "New A.R.I.E.S. Intake Form — " + nameField.value.trim();
    var honeypotValue = document.getElementById("honeypot").value;

    fetch(SERVER_URL + "/api/submit-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: subject,
        text: summary,
        replyToEmail: emailField.value.trim(),
        honeypot: honeypotValue,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Submission failed.");
          return data;
        });
      })
      .then(function () {
        statusEl.style.color = "#7CFC00";
        statusEl.textContent = "Submitted! Your completed form has been sent to A.R.I.E.S. Thank you.";
        document.getElementById("submitBtn").disabled = true;
      })
      .catch(function (err) {
        statusEl.style.color = "#ff6b6b";
        statusEl.textContent = "Couldn't submit: " + err.message + " — you can still use \"DOWNLOAD PDF\" and email it manually.";
      });
  });
})();
</script>
