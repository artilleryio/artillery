man:
	ronn man/artillery.1.md --roff --organization=artillery.io

man-docker:
	cat man/artillery.1.md | docker run --rm -i kadock/ronn > man/artillery.1

.PHONY: man
