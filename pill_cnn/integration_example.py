"""Minimal Python API example for downstream integration."""

import argparse
import json

from inference import predict


def predict_for_backend(image_path):
    return predict(image_path)


def main():
    parser = argparse.ArgumentParser(description="Downstream integration example")
    parser.add_argument("image", help="Input pill image")
    args = parser.parse_args()
    print(json.dumps(predict_for_backend(args.image), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
