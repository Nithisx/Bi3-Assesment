from llama_cpp import Llama


model_path = "LLM Model\mistral-7b-instruct-v0.2.Q4_K_M.gguf"


llm = Llama(
    model_path=model_path,
    n_ctx=2048,        # context size
    n_threads=8,       # adjust based on your CPU
    n_gpu_layers=0     # set >0 if using GPU
)

if __name__ == "__main__":
    prompt = """<s>[INST] Explain machine learning in simple terms [/INST]"""

    output = llm(
        prompt,
        max_tokens=200,
        temperature=0.7,
        stop=["</s>"]
    )

    print(output["choices"][0]["text"])