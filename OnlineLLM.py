from openai import OpenAI

client = OpenAI(
    api_key="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",
    base_url="https://openrouter.ai/api/v1"
)

MODEL_NAME = "meta-llama/llama-3.1-8b-instruct"

if __name__ == "__main__":
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "user", "content": "Hello, test message"}
        ]
    )

    print(response.choices[0].message.content)