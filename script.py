import os

def create_llm_txt(folder_path, output_file="llm.txt"):
    with open(output_file, "w", encoding="utf-8") as out:
        for root, _, files in os.walk(folder_path):
            for filename in files:
                file_path = os.path.join(root, filename)

                # Skip the output file itself if it's in the same folder
                if filename == output_file:
                    continue

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                except Exception as e:
                    content = f"[ERROR READING FILE: {e}]"

                out.write(f"{filename} -> {content}\n\n")

if __name__ == "__main__":
    folder_to_scan = "VScodeExtension/src"
    create_llm_txt(folder_to_scan)
