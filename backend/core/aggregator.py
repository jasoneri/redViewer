import re
from collections import defaultdict


def _extract_num(ep: str) -> int:
    """提取章节名中的数字用于排序，提取失败返回0"""
    return int(m.group()) if (m := re.search(r'\d+', ep)) else 0


class BooksAggregator:
    """将 BookData 列表聚合为 API 响应格式"""
    
    def __init__(self, sorted_books: list):
        self.singles = []
        self.grouped = defaultdict(list)
        self._classify(sorted_books)
    
    def _classify(self, books):
        for book_data in books:
            api = book_data.to_api()
            if book_data.ep:
                self.grouped[book_data.book].append(api)
            else:
                self.singles.append({"book": api["book"], "first_img": api["first_img"]})
    
    def to_result(self) -> list:
        result = self.singles.copy()
        for book_name, eps in self.grouped.items():
            eps.sort(key=lambda x: _extract_num(x["ep"]))
            result.append({
                "book": book_name,
                "first_img": eps[0]["first_img"],
                "eps": [{"ep": e["ep"], "first_img": e["first_img"]} for e in eps]
            })
        return result