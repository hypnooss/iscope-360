import yaml
import os

BASE_PATH = "/app/contracts/architecture"

def load_module(module_name: str):
    path = os.path.join(BASE_PATH, f"{module_name}.yaml")

    if not os.path.exists(path):
        raise Exception(f"Module not found: {module_name}")

    with open(path, "r") as f:
        data = yaml.safe_load(f)

    return data
