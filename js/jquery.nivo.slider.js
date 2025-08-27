/*
 * Nivo Slider v3.2 - jQuery plugin
 * Simple jQuery slider plugin
 * http://nivo.dev7studios.com
 */
(function($) {
    $.fn.nivoSlider = function(options) {
        var defaults = {
            effect: 'random',
            slices: 15,
            boxCols: 8,
            boxRows: 4,
            animSpeed: 500,
            pauseTime: 3000,
            startSlide: 0,
            directionNav: true,
            controlNav: true,
            pauseOnHover: true,
            manualAdvance: false
        };

        var settings = $.extend({}, defaults, options);

        return this.each(function() {
            var $this = $(this);
            var slider = {
                currentSlide: 0,
                totalSlides: 0,
                running: false,
                paused: false,
                stop: false
            };

            var slides = $this.children('img');
            slider.totalSlides = slides.length;

            // Hide all slides except first
            slides.not(':first').hide();

            // Create controls
            if (settings.controlNav) {
                var controlNav = $('<div class="nivo-controlNav"></div>');
                for (var i = 0; i < slider.totalSlides; i++) {
                    controlNav.append('<a class="nivo-control" rel="' + i + '">' + (i + 1) + '</a>');
                }
                $this.after(controlNav);

                controlNav.find('a:first').addClass('active');
                controlNav.find('a').click(function() {
                    if (slider.running) return false;
                    if ($(this).hasClass('active')) return false;
                    clearInterval(timer);
                    slider.currentSlide = $(this).attr('rel') - 1;
                    nivoRun($(this).attr('rel'));
                    return false;
                });
            }

            // Create direction navigation
            if (settings.directionNav) {
                $this.after('<div class="nivo-directionNav"><a class="nivo-prevNav">Prev</a><a class="nivo-nextNav">Next</a></div>');
                
                $this.parent().find('.nivo-prevNav').click(function() {
                    if (slider.running) return false;
                    clearInterval(timer);
                    slider.currentSlide -= 2;
                    nivoRun('prev');
                    return false;
                });

                $this.parent().find('.nivo-nextNav').click(function() {
                    if (slider.running) return false;
                    clearInterval(timer);
                    nivoRun('next');
                    return false;
                });
            }

            // Pause on hover
            if (settings.pauseOnHover) {
                $this.hover(function() {
                    slider.paused = true;
                    clearInterval(timer);
                }, function() {
                    slider.paused = false;
                    if (!settings.manualAdvance && !slider.stop) {
                        timer = setInterval(function() {
                            nivoRun('next');
                        }, settings.pauseTime);
                    }
                });
            }

            // Auto start
            var timer = 0;
            if (!settings.manualAdvance && !slider.stop) {
                timer = setInterval(function() {
                    nivoRun('next');
                }, settings.pauseTime);
            }

            function nivoRun(nudge) {
                if (slider.running && !nudge) return false;
                
                var currentSlide = slides.eq(slider.currentSlide);
                
                if (nudge) {
                    if (nudge === 'next') {
                        slider.currentSlide++;
                    } else if (nudge === 'prev') {
                        slider.currentSlide--;
                    } else {
                        slider.currentSlide = parseInt(nudge);
                    }
                } else {
                    slider.currentSlide++;
                }

                if (slider.currentSlide === slider.totalSlides) {
                    slider.currentSlide = 0;
                }
                if (slider.currentSlide < 0) {
                    slider.currentSlide = (slider.totalSlides - 1);
                }

                var targetSlide = slides.eq(slider.currentSlide);

                slider.running = true;

                // Fade effect
                currentSlide.fadeOut(settings.animSpeed, function() {
                    targetSlide.fadeIn(settings.animSpeed, function() {
                        slider.running = false;
                    });
                });

                // Update control nav
                if (settings.controlNav) {
                    $this.parent().find('.nivo-controlNav a').removeClass('active');
                    $this.parent().find('.nivo-controlNav a:eq(' + slider.currentSlide + ')').addClass('active');
                }

                if (!settings.manualAdvance && !slider.paused && !slider.stop) {
                    timer = setInterval(function() {
                        nivoRun('next');
                    }, settings.pauseTime);
                }
            }

            // Set first slide
            slider.currentSlide = settings.startSlide;
            if (settings.startSlide > 0) {
                slides.hide();
                slides.eq(settings.startSlide).show();
                if (settings.controlNav) {
                    $this.parent().find('.nivo-controlNav a').removeClass('active');
                    $this.parent().find('.nivo-controlNav a:eq(' + settings.startSlide + ')').addClass('active');
                }
            }
        });
    };
})(jQuery);