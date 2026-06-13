from OnlineLLM import client
import json

prompt = """[INST] You are a professional customer feedback analysis AI.
Analyze the customer feedback message below and extract three structured attributes:
1. "sentiment": Must be exactly "Positive", "Negative", or "Neutral"
2. "category": Must be exactly one of: "Billing", "App Bug", "Delivery", "Staff/Support", "Other"
3. "summary": A concise, one-line summary of the core issue.

Respond ONLY with a valid JSON object. Do not include markdown formatting, backticks, or any other explanations.

Format:
{
  "sentiment": "sentiment_here",
  "category": "category_here",
  "summary": "summary_text_here"
}

Feedback:
"Double deduction on my card for order need this reversed ASAP!" [/INST]"""

try:
    response = client.chat.completions.create(
        model="openrouter/auto",
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=100,
        temperature=0.1
    )
    print("SUCCESS RESPONSE:")
    print(response)
except Exception as e:
    print("FAILED QUERY:")
    print(e)
