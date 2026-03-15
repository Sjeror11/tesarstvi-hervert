const SITE_CONTENT_URL = "data/site-content.json";
const CMS_API_BASE = "https://tesarstvi-hervert-cms.sjeror11.workers.dev";

$(document).ready(function () {
    loadSiteContent()
        .then(async function (content) {
            const mergedContent = await mergeRemoteGalleries(content);
            renderSite(mergedContent);
            initSlider();
            initGallery(mergedContent.services || []);
            initForms();
        })
        .catch(function (error) {
            console.error("Nepodařilo se načíst obsah webu:", error);
            showContentError();
        });
});

async function loadSiteContent() {
    const response = await fetch(SITE_CONTENT_URL, { cache: "no-store" });

    if (!response.ok) {
        throw new Error("HTTP " + response.status);
    }

    return response.json();
}

async function mergeRemoteGalleries(content) {
    const services = Array.isArray(content.services) ? content.services : [];

    try {
        const response = await fetch(CMS_API_BASE + "/api/public/galleries", { cache: "no-store" });

        if (!response.ok) {
            return content;
        }

        const payload = await response.json();
        const photosByService = payload.photosByService || {};

        return {
            ...content,
            services: services.map(function (service) {
                if (!Array.isArray(photosByService[service.slug])) {
                    return service;
                }

                return {
                    ...service,
                    photos: photosByService[service.slug].map(function (photo) {
                        return photo.url;
                    })
                };
            })
        };
    } catch (error) {
        console.warn("Dynamicke galerie nejsou dostupne, pouzivam lokalni data.", error);
        return content;
    }
}

function renderSite(content) {
    renderSeo(content.seo || {});
    renderCompany(content.company || {});
    renderSliderContent(content.slider || []);
    renderIntro(content.intro || {});
    renderServices(content.services || []);
    renderAbout(content.about || {});
    renderFooter(content.footer || {});
}

function renderSeo(seo) {
    if (seo.title) {
        document.title = seo.title;
    }

    if (seo.description) {
        $('meta[name="description"]').attr("content", seo.description);
    }
}

function renderCompany(company) {
    $("#brand-name").text(company.name || "");
    $("#brand-tagline").text(company.tagline || "");
    $("#header-phone-text").text(company.phoneDisplay || "");
    $("#header-phone-link").attr("href", company.phoneHref || "#");
    $("#header-email-link")
        .text(company.emailDisplay || "")
        .attr("href", company.emailHref || "#");
}

function renderSliderContent(slides) {
    const sliderHtml = slides
        .map(function (slide) {
            return (
                '<img src="' +
                slide.src +
                '" alt="' +
                escapeAttribute(slide.alt || "") +
                '" title="' +
                escapeAttribute(slide.title || "") +
                '">'
            );
        })
        .join("");

    $("#slider").html(sliderHtml || '<div class="content-loading">Prezentace je momentálně prázdná.</div>');
}

function renderIntro(intro) {
    $("#intro-heading").text(intro.heading || "");
    $("#intro-text").text(intro.text || "");
}

function renderServices(services) {
    const servicesHtml = services
        .map(function (service) {
            return (
                '<div class="service-item gallery-trigger" data-category="' +
                escapeAttribute(service.slug || "") +
                '">' +
                '<div class="service-image">' +
                '<img src="' +
                service.thumb +
                '" alt="' +
                escapeAttribute(service.thumbAlt || service.title || "") +
                '">' +
                "</div>" +
                "<h3>" +
                escapeHtml(service.title || "") +
                "</h3>" +
                "<p>" +
                escapeHtml(service.description || "") +
                "</p>" +
                "</div>"
            );
        })
        .join("");

    $("#services-grid").html(servicesHtml || '<div class="content-loading">Služby nejsou zatím vyplněné.</div>');
}

function renderAbout(about) {
    $("#about-heading").text(about.heading || "");

    const paragraphsHtml = (about.paragraphs || [])
        .map(function (paragraph) {
            return "<p>" + escapeHtml(paragraph) + "</p>";
        })
        .join("");

    const benefitsHtml = (about.benefits || [])
        .map(function (benefit) {
            return "<li>✓ " + escapeHtml(benefit) + "</li>";
        })
        .join("");

    $("#about-paragraphs").html(paragraphsHtml || "<p>Informace o firmě nejsou zatím vyplněné.</p>");
    $("#benefits-list").html(benefitsHtml);
}

function renderFooter(footer) {
    $("#footer-contact").html(formatMultilineText(footer.contactText || ""));
    $("#footer-services").text(footer.servicesText || "");
    $("#newsletter-heading").text(footer.newsletterHeading || "Newsletter");
    $("#newsletter-text").text(footer.newsletterText || "");
    $("#footer-copyright").text(footer.copyright || "");

    if (footer.newsletterEnabled === false) {
        $("#footer-newsletter-section").hide();
    } else {
        $("#footer-newsletter-section").show();
    }
}

function initSlider() {
    const $slides = $("#slider img");

    if ($slides.length === 0) {
        return;
    }

    let currentSlide = 0;
    const totalSlides = $slides.length;
    let slideInterval = null;
    let isCompleted = false;

    $slides.hide();
    $slides.first().show();

    function nextSlide() {
        if (isCompleted) {
            return;
        }

        $("#slider img").fadeOut(600);

        setTimeout(function () {
            currentSlide += 1;

            if (currentSlide >= totalSlides) {
                currentSlide = 0;
                $("#slider img").first().fadeIn(600);

                setTimeout(function () {
                    isCompleted = true;
                    $(".nivo-directionNav, .nivo-controlNav").fadeOut(1000);
                    $("#restart-slider").fadeIn(1000);
                }, 1000);
            } else {
                $("#slider img").eq(currentSlide).fadeIn(600);
            }
        }, 300);
    }

    slideInterval = window.setInterval(nextSlide, 6000);

    window.setTimeout(function () {
        if (slideInterval) {
            window.clearInterval(slideInterval);
        }
    }, totalSlides * 6000 + 2000);

    $("#slider").nivoSlider({
        effect: "fade",
        animSpeed: 600,
        pauseTime: 999999,
        directionNav: true,
        controlNav: true,
        pauseOnHover: false,
        manualAdvance: true,
        randomStart: false
    });

    $('<button id="restart-slider" style="position: absolute; top: 10px; right: 10px; background: rgba(139,69,19,0.8); color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; z-index: 100; display: none;">Restart</button>')
        .appendTo("#slider-section")
        .on("click", function () {
            currentSlide = 0;
            isCompleted = false;

            if (slideInterval) {
                window.clearInterval(slideInterval);
            }

            $("#slider img").hide();
            $("#slider img").first().show();

            slideInterval = window.setInterval(nextSlide, 6000);

            window.setTimeout(function () {
                if (slideInterval) {
                    window.clearInterval(slideInterval);
                }
            }, totalSlides * 6000 + 2000);

            $(".nivo-directionNav, .nivo-controlNav").fadeIn(500);
            $("#restart-slider").hide();
        });
}

function initGallery(services) {
    const galleries = {};

    services.forEach(function (service) {
        galleries[service.slug] = {
            title: service.galleryTitle || service.title || "",
            photos: service.photos || []
        };
    });

    $(document).on("click", ".gallery-trigger", function (event) {
        event.preventDefault();

        const category = $(this).data("category");

        if (galleries[category]) {
            openGallery(galleries[category]);
        }
    });

    $(window).on("popstate", function () {
        const $gallery = $(".photo-gallery");

        if ($gallery.length > 0) {
            $gallery.addClass("closing");

            window.setTimeout(function () {
                $gallery.remove();
            }, 200);
        }
    });
}

function openGallery(gallery) {
    history.pushState({ gallery: true }, "", "#galerie-" + slugify(gallery.title));

    let galleryHtml =
        '<div class="photo-gallery">' +
        '<div class="gallery-header">' +
        "<h3>" +
        escapeHtml(gallery.title) +
        "</h3>" +
        '<button class="gallery-close">&times;</button>' +
        "</div>" +
        '<div class="gallery-grid">';

    gallery.photos.forEach(function (photo, index) {
        galleryHtml +=
            '<div class="gallery-item">' +
            '<a href="' +
            photo +
            '" target="_blank" rel="noopener noreferrer">' +
            '<img src="' +
            photo +
            '" alt="' +
            escapeAttribute(gallery.title + " " + (index + 1)) +
            '">' +
            "</a>" +
            "</div>";
    });

    galleryHtml += "</div></div>";

    $("body").append(galleryHtml);

    $(".gallery-close, .photo-gallery").on("click", function (event) {
        if (event.target === this) {
            closeGallery();
        }
    });
}

function closeGallery() {
    const $gallery = $(".photo-gallery");

    if ($gallery.length === 0) {
        return;
    }

    $gallery.addClass("closing");

    window.setTimeout(function () {
        $gallery.remove();
    }, 200);

    if (window.location.hash.startsWith("#galerie-")) {
        history.back();
    }
}

function initForms() {
    $(".newsletter-form").on("submit", function (event) {
        event.preventDefault();
    });
}

function showContentError() {
    $("#main-content .container").prepend(
        '<div class="content-error">Obsah webu se nepodařilo načíst. Zkontrolujte, že stránku otevíráte přes webový server a že je dostupný soubor <code>data/site-content.json</code>.</div>'
    );
}

function slugify(value) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

function formatMultilineText(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
}
