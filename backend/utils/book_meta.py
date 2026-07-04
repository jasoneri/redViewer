#!/usr/bin/python
# -*- coding: utf-8 -*-

import re


_META_TAG_REGEX = re.compile(
    r"汉化|漢化|粵化|DL版|修正|中国|翻訳|翻译|翻譯|中文|後編|前編|カラー化|個人|"
    r"無修|重修|重嵌|机翻|機翻|整合|黑字|Chinese|Japanese|\[Digital]|vol|\[\d+]"
)


def normalize_meta_book_name(title: str) -> str:
    author_tags = re.findall(r"\[.*?]", title)
    if re.search(r"[(（]", "".join(author_tags)):
        author_tags = [tag for tag in author_tags if re.search(r"[(（]", tag)]
    else:
        author_tags = [tag for tag in author_tags if not _META_TAG_REGEX.search(tag)]
    if len(author_tags) > 1:
        if len(set(author_tags)) == 1:
            author_tags = [author_tags[0]]
        else:
            return title
    if not author_tags:
        return title
    author = author_tags[0]
    return (author + title.replace(author, "").replace("  ", " ")).strip()


def split_meta_tags(value: str | None) -> list[str]:
    if not value:
        return []
    tags = [tag.strip() for tag in re.split(r"[,，]", value) if tag.strip()]
    if len(tags) == 1 and "," not in value and "，" not in value:
        spaced = [tag.strip() for tag in re.split(r"\s+", value.strip()) if tag.strip()]
        if len(spaced) > 1:
            return spaced
    return tags
