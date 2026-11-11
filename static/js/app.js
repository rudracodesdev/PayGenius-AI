let currentInvoiceId = null;
let paypalConfig = { paypalClientId: null, paypalMode: "simulated" };
let paypalSdkPromise = null;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function money(amount) {
    return `$${Number(amount).toFixed(2)}`;
}

async function loadConfig() {
    try {
        const res = await fetch("/api/config");
        if (res.ok) paypalConfig = await res.json();
    } catch (e) { /* keep simulated defaults */ }
    document.getElementById("paypal-mode").innerText =
        paypalConfig.paypalMode === "sandbox" ? "PayPal Sandbox Active" : "PayPal Simulated Mode";
}

async function loadDashboard() {
    const res = await fetch("/api/dashboard");
    if (!res.ok) {
        document.getElementById("invoice-rows").innerHTML =
            `<tr><td colspan="6" class="text-muted">Could not load invoices.</td></tr>`;
        document.getElementById("tx-rows").innerHTML =
            `<tr><td colspan="5" class="text-muted">Could not load transactions.</td></tr>`;
        return;
    }
    const { invoices, transactions } = await res.json();
    renderInvoices(invoices);
    renderTransactions(transactions);

    const volume = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    document.getElementById("stat-volume").innerText = `$${volume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById("stat-tx-count").innerText = transactions.length;
    document.getElementById("stat-invoices").innerText = invoices.length;
    document.getElementById("invoice-count").innerText = invoices.length;
    document.getElementById("tx-count").innerText = transactions.length;
}

function renderInvoices(invoices) {
    const tbody = document.getElementById("invoice-rows");
    if (!invoices.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No invoices yet. Generate one above.</td></tr>`;
        return;
    }
    tbody.innerHTML = invoices.map((inv) => `
        <tr>
            <td><span class="code-id">${escapeHtml(inv.invoiceId)}</span></td>
            <td>
                <div class="client-cell">
                    <strong>${escapeHtml(inv.clientName)}</strong>
                    <small>${escapeHtml(inv.clientEmail)}</small>
                </div>
            </td>
            <td class="desc-cell">${escapeHtml(inv.description)}</td>
            <td><strong class="price-val">${money(inv.amount)}</strong></td>
            <td>${inv.status === "PAID"
                ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Settled</span>`
                : `<span class="badge badge-warning"><i class="fa-regular fa-clock"></i> Pending</span>`}</td>
            <td>${inv.status === "PENDING"
                ? `<button class="btn-paypal" data-invoice="${escapeHtml(inv.invoiceId)}" data-amount="${Number(inv.amount).toFixed(2)}">
                       <i class="fa-brands fa-paypal"></i> Pay with PayPal
                   </button>`
                : `<span class="settled-tag"><i class="fa-solid fa-lock"></i> Captured</span>`}</td>
        </tr>`).join("");

    tbody.querySelectorAll(".btn-paypal").forEach((btn) => {
        btn.addEventListener("click", () => openPayModal(btn.dataset.invoice, btn.dataset.amount));
    });
}

function renderTransactions(transactions) {
    const tbody = document.getElementById("tx-rows");
    if (!transactions.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No settlements yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = transactions.map((tx) => {
        const score = Math.min(100, Math.max(0, Number(tx.riskScore)));
        let verdict = `<span class="badge badge-danger"><i class="fa-solid fa-skull-crossbones"></i> FLAGGED</span>`;
        if (tx.riskStatus === "LOW") verdict = `<span class="badge badge-success"><i class="fa-solid fa-shield-check"></i> LOW RISK</span>`;
        else if (tx.riskStatus === "MEDIUM") verdict = `<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> REVIEW</span>`;
        return `
        <tr>
            <td><code class="code-id">${escapeHtml(tx.paypalOrderId)}</code></td>
            <td><span class="code-sub">${escapeHtml(tx.invoiceId)}</span></td>
            <td><strong class="price-val">${money(tx.amount)}</strong></td>
            <td>
                <div class="risk-bar-wrap">
                    <div class="risk-bar" style="width: ${score}%;"></div>
                    <span>${score}%</span>
                </div>
            </td>
            <td>${verdict}</td>
        </tr>`;
    }).join("");
}

async function generateInvoice() {
    const prompt = document.getElementById("ai-prompt").value;
    const client_email = document.getElementById("ai-email").value;

    if (!prompt || !client_email) {
        alert("Please provide both an invoice prompt and client email.");
        return;
    }

    const btn = document.getElementById("btn-generate");
    btn.disabled = true;
    try {
        const res = await fetch("/api/ai/generate-invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, client_email })
        });
        if (res.ok) {
            document.getElementById("ai-prompt").value = "";
            document.getElementById("ai-email").value = "";
            await loadDashboard();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || "Error generating invoice.");
        }
    } finally {
        btn.disabled = false;
    }
}

function loadPaypalSdk() {
    if (!paypalSdkPromise) {
        paypalSdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalConfig.paypalClientId)}&currency=USD`;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    return paypalSdkPromise;
}

function openPayModal(invoiceId, amount) {
    currentInvoiceId = invoiceId;
    document.getElementById("modal-invoice-title").innerText = `Pay Invoice ${invoiceId} ($${amount})`;
    document.getElementById("payment-modal").style.display = "flex";
    renderPayPalButtons();
}

function closePayModal() {
    document.getElementById("payment-modal").style.display = "none";
    document.getElementById("paypal-button-container").innerHTML = "";
}

async function captureOrder(orderId) {
    const res = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, invoice_id: currentInvoiceId })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
        alert(result.detail || "Payment capture failed.");
        return;
    }
    alert(`Payment completed! Risk level evaluated as: ${result.risk_evaluation.status}`);
    closePayModal();
    await loadDashboard();
}

async function createOrder() {
    const res = await fetch(`/api/paypal/create-order/${encodeURIComponent(currentInvoiceId)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Could not create order");
    return data.id;
}

async function renderPayPalButtons() {
    const container = document.getElementById("paypal-button-container");
    container.innerHTML = "";

    if (paypalConfig.paypalMode !== "sandbox") {
        // No PayPal sandbox credentials configured: offer a simulated checkout
        container.innerHTML = `
            <p class="modal-sub">PayPal sandbox credentials aren't configured, so checkout runs in simulated mode.</p>
            <button class="btn-primary" id="btn-simulate"><i class="fa-brands fa-paypal"></i> Simulate Sandbox Payment</button>`;
        const simulateBtn = document.getElementById("btn-simulate");
        simulateBtn.addEventListener("click", async () => {
            simulateBtn.disabled = true;
            try {
                await captureOrder(await createOrder());
            } catch (err) {
                alert(err.message);
                simulateBtn.disabled = false;
            }
        });
        return;
    }

    try {
        await loadPaypalSdk();
    } catch (e) {
        container.innerHTML = `<p class="modal-sub">Could not load the PayPal SDK.</p>`;
        return;
    }

    paypal.Buttons({
        createOrder,
        onApprove: (data) => captureOrder(data.orderID)
    }).render("#paypal-button-container");
}

function fillPrompt(text, email) {
    document.getElementById("ai-prompt").value = text;
    document.getElementById("ai-email").value = email;
}

loadConfig();
loadDashboard();
