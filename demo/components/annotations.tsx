import { ExternalLinkIcon } from "lucide-react";

export type Annotation = {
	type: "file_citation" | "url_citation" | "container_file_citation";
	fileId?: string;
	containerId?: string;
	url?: string;
	title?: string;
	filename?: string;
	index?: number;
};

const AnnotationPill = ({ annotation }: { annotation: Annotation }) => {
	const className =
		"inline-block text-nowrap px-3 py-1 rounded-full text-xs max-w-48 shrink-0 text-ellipsis overflow-hidden bg-[#ededed] text-zinc-500";

	switch (annotation.type) {
		case "file_citation":
			return <span className={className}>{annotation.filename}</span>;
		case "url_citation":
			return (
				<a target="_blank" rel="noopener noreferrer" href={annotation.url} className={className}>
					<div className=" flex items-center gap-1">
						<div className="truncate">{annotation.title}</div>
						<ExternalLinkIcon size={12} className="shrink-0" />
					</div>
				</a>
			);
		case "container_file_citation":
			return (
				<a
					href={`/api/container_files/content?file_id=${annotation.fileId}${annotation.containerId ? `&container_id=${annotation.containerId}` : ""}${annotation.filename ? `&filename=${encodeURIComponent(annotation.filename)}` : ""}`}
					download
					className={`${className} flex items-center gap-1`}
				>
					<span className="truncate">{annotation.filename || annotation.fileId}</span>
					<ExternalLinkIcon size={12} className="shrink-0" />
				</a>
			);
	}
};

const Annotations = ({ annotations }: { annotations: Annotation[] }) => {
	const uniqueAnnotations = annotations.reduce((acc: Annotation[], annotation) => {
		if (
			!acc.some(
				(a: Annotation) =>
					a.type === annotation.type &&
					((annotation.type === "file_citation" && a.fileId === annotation.fileId) ||
						(annotation.type === "url_citation" && a.url === annotation.url) ||
						(annotation.type === "container_file_citation" && a.fileId === annotation.fileId))
			)
		) {
			acc.push(annotation);
		}
		return acc;
	}, []);

	return (
		<div className="flex max-w-full mr-28 ml-4 overflow-x-scroll gap-2 mb-2">
			{uniqueAnnotations.map((annotation: Annotation, index: number) => (
				<AnnotationPill key={index} annotation={annotation} />
			))}
		</div>
	);
};

export default Annotations;
