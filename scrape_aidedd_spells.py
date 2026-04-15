#!/usr/bin/env python3
import argparse
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

LIST_URL = "https://www.aidedd.org/dnd-filters/sorts.php"
DETAIL_BASE_URL = "https://www.aidedd.org/dnd/sorts.php?vf={slug}"


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def slugify_spell_name(name: str) -> str:
    # Remove accents, lowercase, kebab-case
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[’']", "-", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def extract_list_rows(html: str):
    soup = BeautifulSoup(html, "html.parser")
    spells = []

    # Try parsing table rows first (most likely structure)
    for table in soup.select("table"):
        headers = [clean_text(th.get_text(" ", strip=True)) for th in table.select("thead th")]
        rows = table.select("tbody tr") or table.select("tr")

        for tr in rows:
            tds = tr.find_all("td")
            if not tds:
                continue

            cells = [clean_text(td.get_text(" ", strip=True)) for td in tds]
            name = cells[0] if cells else ""
            if not name:
                continue

            row_data = {}
            if headers and len(headers) == len(cells):
                for k, v in zip(headers, cells):
                    row_data[k] = v
            else:
                for i, v in enumerate(cells, start=1):
                    row_data[f"col_{i}"] = v

            spells.append({
                "name": name,
                "list_data": row_data,
            })

    # Fallback: if table parsing returns nothing, try links containing sorts.php
    if not spells:
        for a in soup.select('a[href*="sorts.php"]'):
            name = clean_text(a.get_text(" ", strip=True))
            if name and len(name) > 1:
                spells.append({"name": name, "list_data": {}})

    # Deduplicate by normalized name
    unique = {}
    for s in spells:
        key = clean_text(s["name"]).lower()
        if key not in unique:
            unique[key] = s
    return list(unique.values())


def extract_attributes(detail_soup: BeautifulSoup):
    attrs = {}

    # 1) Format spécifique AideDD (d, t, c, r, ecole)
    class_map = {
        "d": "duree",
        "t": "temps_incantation",
        "c": "composantes",
        "r": "portee",
        "ecole": "ecole",
    }

    for css_class, out_key in class_map.items():
        node = detail_soup.select_one(f"div.{css_class}")
        if node:
            value = clean_text(node.get_text(" ", strip=True))
            if value:
                attrs[out_key] = value

    # 2) Fallback table-based attributes
    for tr in detail_soup.select("table tr"):
        th = tr.find("th")
        td = tr.find("td")
        if th and td:
            k = clean_text(th.get_text(" ", strip=True))
            v = clean_text(td.get_text(" ", strip=True))
            if k and v and k not in attrs:
                attrs[k] = v

    # 3) Fallback definition-list attributes
    for dt in detail_soup.select("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            k = clean_text(dt.get_text(" ", strip=True))
            v = clean_text(dd.get_text(" ", strip=True))
            if k and v and k not in attrs:
                attrs[k] = v

    return attrs


def extract_description(detail_soup: BeautifulSoup):
    # 1) Structure AideDD observée : .col1 .description
    node = detail_soup.select_one("div.col1 div.description") or detail_soup.select_one("div.description")
    if node:
        # Copie locale pour transformer les <br> en sauts de ligne
        local = BeautifulSoup(str(node), "html.parser")
        for br in local.select("br"):
            br.replace_with("\n")

        raw = local.get_text("\n", strip=True)
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in raw.splitlines()]
        lines = [ln for ln in lines if ln]
        return "\n\n".join(lines)

    # 2) Fallback générique
    candidates = []
    for sel in ["article", "main", "#contenu", ".contenu", ".boxcontent", ".content"]:
        for n in detail_soup.select(sel):
            txt = clean_text(n.get_text(" ", strip=True))
            if len(txt) > 60:
                candidates.append(txt)

    if not candidates:
        txt = clean_text(detail_soup.get_text(" ", strip=True))
        if txt:
            candidates.append(txt)

    return max(candidates, key=len) if candidates else ""


def fetch_detail(session: requests.Session, name: str, timeout: float):
    slug = slugify_spell_name(name)
    url = DETAIL_BASE_URL.format(slug=quote(slug))
    r = session.get(url, timeout=timeout)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    title_node = soup.find("h1")
    title = clean_text(title_node.get_text(" ", strip=True)) if title_node else name

    return {
        "name": name,
        "slug": slug,
        "detail_url": url,
        "page_title": title,
        "attributes": extract_attributes(soup),
        "description": extract_description(soup),
    }


def main():
    parser = argparse.ArgumentParser(description="Scrape AideDD spells list + details to JSON.")
    parser.add_argument("-o", "--output", default="aidedd_spells.json", help="Output JSON file path")
    parser.add_argument("--delay", type=float, default=0.35, help="Delay between detail requests (seconds)")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; AideDD-Scraper/1.0; +local-script)"
    })

    list_resp = session.get(LIST_URL, timeout=args.timeout)
    list_resp.raise_for_status()
    list_spells = extract_list_rows(list_resp.text)

    result_spells = []
    total = len(list_spells)

    for i, item in enumerate(list_spells, start=1):
        name = item["name"]
        try:
            detail = fetch_detail(session, name, args.timeout)
            detail["list_data"] = item.get("list_data", {})
            result_spells.append(detail)
            print(f"[{i}/{total}] OK  {name}")
        except Exception as exc:
            print(f"[{i}/{total}] ERR {name} -> {exc}")
            result_spells.append({
                "name": name,
                "slug": slugify_spell_name(name),
                "detail_url": DETAIL_BASE_URL.format(slug=quote(slugify_spell_name(name))),
                "error": str(exc),
                "list_data": item.get("list_data", {}),
            })

        time.sleep(max(0.0, args.delay))

    payload = {
        "source_list_url": LIST_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "count": len(result_spells),
        "spells": result_spells,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(result_spells)} spells to {args.output}")


if __name__ == "__main__":
    main()
