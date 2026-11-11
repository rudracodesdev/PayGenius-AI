let currentInvoiceId = null;

async function generateInvoice() {
    const prompt = document.getElementById("ai-prompt").value;
    const client_email = document.getElementById("ai-email").value;

    if (!prompt || !client_email) {
        alert("Please provide both an invoice prompt and client email.");
        return;
    }

    const res = await fetch("/api/ai/generate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_email })
    });

    if (res.ok) {
        window.location.reload();
    } else {
        alert("Error generating invoice.");
    }
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

function renderPayPalButtons() {
    document.getElementById("paypal-button-container").innerHTML = "";
    
    paypal.Buttons({
        createOrder: async () => {
            const res = await fetch(`/api/paypal/create-order/${currentInvoiceId}`, { method: "POST" });
            const data = await res.json();
            return data.id;
        },
        onApprove: async (data) => {
            const res = await fetch("/api/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: data.orderID, invoice_id: currentInvoiceId })
            });
            const result = await res.json();
            alert(`Payment completed! Risk level evaluated as: ${result.risk_evaluation.status}`);
            window.location.reload();
        }
    }).render("#paypal-button-container");
}

function fillPrompt(text, email) {
    document.getElementById("ai-prompt").value = text;
    document.getElementById("ai-email").value = email;
}
