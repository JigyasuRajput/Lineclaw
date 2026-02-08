(function () {
  const form = document.getElementById("draft-form");
  const statusNode = document.getElementById("status");
  const candidatesNode = document.getElementById("candidates");
  const submitBtn = document.getElementById("submit-btn");

  function setStatus(text, kind) {
    statusNode.textContent = text;
    statusNode.className = `status ${kind}`;
  }

  function renderCandidates(candidates) {
    candidatesNode.innerHTML = "";
    for (const candidate of candidates) {
      const li = document.createElement("li");
      li.textContent = candidate;
      candidatesNode.appendChild(li);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const data = new FormData(form);
    const payload = {
      audience_tag: data.get("audience_tag"),
      purpose: data.get("purpose"),
      tone: data.get("tone"),
      language: data.get("language"),
    };
    const adminKey = String(data.get("admin_key") || "").trim();

    submitBtn.disabled = true;
    setStatus("Generating...", "loading");

    try {
      const response = await fetch("/api/manager/draft-sentences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(adminKey ? { "x-admin-key": adminKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || "Request failed");
      }

      renderCandidates(json.candidates || []);
      setStatus("Ready", "success");
    } catch (error) {
      renderCandidates([`Error: ${error.message}`]);
      setStatus("Failed", "error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  form.addEventListener("submit", handleSubmit);
})();
