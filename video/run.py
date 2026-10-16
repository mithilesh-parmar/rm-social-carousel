#!/usr/bin/env python3
"""Entry point: python3 video/run.py <command> ...  (npm run video -- <command> ...)"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rmvideo.cli import main  # noqa: E402

sys.exit(main())
