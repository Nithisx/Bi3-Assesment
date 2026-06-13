from openai import OpenAI

client = OpenAI(
    api_key="******",
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