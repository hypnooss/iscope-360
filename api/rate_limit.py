import time
from collections import defaultdict
from typing import DefaultDict, List

_window_sec = 60
_max_per_window = 30
_buckets: DefaultDict[str, List[float]] = defaultdict(list)

def check_rate_limit(key: str, max_calls: int = None, window: float = None) -> bool:
    max_calls = max_calls or _max_per_window
    window = window or _window_sec
    now = time.monotonic()
    cutoff = now - window
    arr = _buckets[key]
    while arr and arr[0] < cutoff:
        arr.pop(0)
    if len(arr) >= max_calls:
        return False
    arr.append(now)
    return True
