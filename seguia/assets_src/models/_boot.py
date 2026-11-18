"""Rend `lib` importable depuis les scripts de assets_src/models/."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
