def execute_module(module, payload):
    print(f"Executing module: {module['module']['name']}", flush=True)

    flow = module["module"].get("flow", [])

    for step in flow:
        step_id = step.get("id")
        step_name = step.get("name")
        tools = step.get("tools", [])
        capabilities = step.get("capabilities", [])

        print(f"\n[STEP] {step_id} - {step_name}", flush=True)
        print(f"Tools: {tools}", flush=True)
        print(f"Capabilities: {capabilities}", flush=True)

        # MOCK execution (por enquanto)
        print("Executing step (mock)...", flush=True)

    print("\nModule execution finished.", flush=True)
